import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initSession, sliceStlMulti, preparePlate, getLastStatistics } from '../src/worker/engine-bridge.mjs';

globalThis.require ??= createRequire(import.meta.url);
globalThis.__dirname ??= '.';
globalThis.__filename ??= '';

const transform = ({ scale = [1, 1, 1], rotation = [0, 0, 0], mirror = [1, 1, 1], offset = [NaN, NaN] } = {}) =>
  [...scale, ...rotation, ...mirror, ...offset];
const size = bounds => bounds.map(([min, max]) => max - min);
const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`);

// Concave footprint plus unequal X/Y/Z extents makes rotation direction/order and mirroring observable.
function asymmetricPrism() {
  const polygon = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 25], [0, 25]];
  const vertices = polygon.flatMap(([x, y]) => [[x, y, 0], [x, y, 10]]);
  const triangles = [];
  for (const [a, b, c] of [[0, 1, 3], [1, 2, 3], [0, 3, 5], [3, 4, 5]])
    triangles.push([a * 2, c * 2, b * 2], [a * 2 + 1, b * 2 + 1, c * 2 + 1]);
  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length;
    triangles.push([i * 2, next * 2, next * 2 + 1], [i * 2, next * 2 + 1, i * 2 + 1]);
  }
  const facets = triangles.map(face => `facet normal 0 0 0\nouter loop\n${face.map(i => `vertex ${vertices[i].join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n');
  return new TextEncoder().encode(`solid asymmetric-l-prism\n${facets}\nendsolid asymmetric-l-prism\n`);
}

// The profile uses relative E. Positive-E object moves exclude start G-code and travel coordinates.
function extrusionGeometry(gcode) {
  let x, y, printingObject = false;
  const points = [];
  for (const line of gcode.split(/\r?\n/)) {
    if (/^; printing object /.test(line)) printingObject = true;
    if (/^; stop printing object /.test(line)) printingObject = false;
    if (!/^G[01]\b/.test(line)) continue;
    const nextX = Number(/\bX(-?\d+(?:\.\d+)?)/.exec(line)?.[1] ?? x);
    const nextY = Number(/\bY(-?\d+(?:\.\d+)?)/.exec(line)?.[1] ?? y);
    if (printingObject && Number(/\bE(-?\d+(?:\.\d+)?)/.exec(line)?.[1]) > 0) points.push([x, y], [nextX, nextY]);
    x = nextX; y = nextY;
  }
  assert.ok(points.length > 100, 'Expected object extrusion coordinates');
  const bounds = [0, 1].map(axis => [Math.min(...points.map(p => p[axis])), Math.max(...points.map(p => p[axis]))]);
  const centerX = (bounds[0][0] + bounds[0][1]) / 2;
  return { bounds, xSkew: points.reduce((sum, point) => sum + (point[0] - centerX) ** 3, 0) / points.length };
}

const js = await readFile('.engine-cache/wasm-v2.4.2-patch19/slicer.js', 'utf8');
const wasm = await readFile('.engine-cache/wasm-v2.4.2-patch19/slicer.wasm');
const { default: factory } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(`${js}\nexport default OrcaModule;`));
const module = await factory({ wasmBinary: wasm, print: () => {}, printErr: () => {},
  onAbort: reason => { throw new Error(`OrcaWasm aborted: ${reason}`); } });
const baseProfile = JSON.parse(await readFile('profiles/ender3v2-020-pla.json', 'utf8'));
const profile = { ...baseProfile, brim_type: 'no_brim', skirt_loops: 0 };
const mesh = asymmetricPrism();

function withSession(run) {
  const session = initSession(module, JSON.stringify(profile));
  try { return run(session); } finally { module._onewasm_session_destroy(session); }
}

function sliceCase(values) {
  return withSession(session => {
    const gcode = new TextDecoder().decode(sliceStlMulti(module, session, [mesh], Float32Array.from(values)));
    return { ...extrusionGeometry(gcode), gcode, statistics: getLastStatistics(module, session) };
  });
}

try {
  const auto = sliceCase(transform());
  const finite = sliceCase(transform({ offset: [60, 70] }));
  const radians = sliceCase(transform({ rotation: [0, 0, Math.PI / 2], offset: [0, 0] }));
  const degrees = sliceCase(transform({ rotation: [0, 0, 90], offset: [0, 0] }));
  const mixed = sliceCase(transform({ rotation: [Math.PI / 2, Math.PI / 2, Math.PI / 4], offset: [0, 0] }));
  const orderProbe = sliceCase(transform({ rotation: [Math.PI / 2, Math.PI / 2, Math.PI / 2], offset: [0, 0] }));
  const scaled = sliceCase(transform({ scale: [2, 0.5, 1], offset: [0, 0] }));
  const mirrored = sliceCase(transform({ mirror: [-1, 1, 1], offset: [0, 0] }));

  // Finite offsets are deltas from centered placement. Only NaN/NaN enables auto-placement.
  near(finite.bounds[0][0] - auto.bounds[0][0], 60, 0.01, 'X offset delta');
  near(finite.bounds[1][0] - auto.bounds[1][0], 70, 0.01, 'Y offset delta');
  assert.throws(() => sliceCase(transform({ offset: [0, NaN] })), /two finite values or two NaN values/);

  // pi/2 swaps the unequal footprint axes; literal 90 does not, proving radians.
  near(size(radians.bounds)[0], size(auto.bounds)[1], 0.1, 'radian quarter-turn X size');
  near(size(radians.bounds)[1], size(auto.bounds)[0], 0.1, 'radian quarter-turn Y size');
  assert.ok(size(degrees.bounds).reduce((sum, value, axis) => sum + Math.abs(value - size(radians.bounds)[axis]), 0) > 5,
    '90 must not behave as a quarter-turn');

  // Together these non-commuting probes uniquely select intrinsic ZYX among the six Euler orders.
  near(size(mixed.bounds)[0], size(mixed.bounds)[1], 0.1, 'ZYX mixed-rotation aspect');
  assert.ok(size(orderProbe.bounds)[0] < 10 && size(orderProbe.bounds)[1] > 20, 'ZYX order probe dimensions changed');

  near(size(scaled.bounds)[0] / size(auto.bounds)[0], 2, 0.03, 'X scale');
  assert.ok(size(scaled.bounds)[1] < size(auto.bounds)[1] * 0.6, 'Y scale must halve the footprint');
  near(size(mirrored.bounds)[0], size(auto.bounds)[0], 0.01, 'X mirror preserves width');
  near(size(mirrored.bounds)[1], size(auto.bounds)[1], 0.1, 'X mirror preserves height');
  assert.ok(auto.xSkew * mirrored.xSkew < 0, 'X mirror must reverse the asymmetric footprint');

  const twoObject = withSession(session => new TextDecoder().decode(sliceStlMulti(module, session, [mesh, mesh],
    Float32Array.from([...transform({ offset: [-40, 0] }), ...transform({ rotation: [0, 0, Math.PI / 2], offset: [40, 0] })]),
    Int32Array.from([1, 1]))));
  assert.ok((twoObject.match(/^; printing object /gm) ?? []).length > 1, 'Both [start,end] STL ranges must be sliced');

  const prepared = withSession(session => ({
    orient: preparePlate(module, session, [mesh], Float32Array.from(transform()), 1),
    arrange: preparePlate(module, session, [mesh, mesh], Float32Array.from([...transform(), ...transform()]), 2),
  }));
  assert.deepEqual(Object.keys(prepared.orient[0]).sort(), ['mirror', 'offset', 'rotation', 'scale']);
  assert.equal(prepared.orient[0].offset, null, 'Auto-orient preserves engine auto-placement');
  assert.ok(prepared.arrange.every(item => item.offset.length === 2 && item.offset.every(Number.isFinite)), 'Arrange returns finite offsets');
  assert.equal(auto.statistics.schemaVersion, '0.2');

  const header = await readFile('.engine-cache/src-patch19/onewasm_slicer_api.h', 'utf8');
  assert.match(header, /#define ONEWASM_OBJECT_TRANSFORM_STRIDE 11/);
  assert.match(header, /const int32_t\* extruder_ids,\s*const float\* object_transforms,/s);
  assert.doesNotMatch(header, /object_(config|settings)/, 'Pinned multi-object API unexpectedly exposes per-object config');

  console.log('Engine contract PASS (real wasm-v2.4.2-patch19 ST)');
  console.log('transform: stride=11 [scale3, rotation3, mirror3, offsetXY2]');
  console.log('rotation: radians, intrinsic ZYX Euler order');
  console.log('offset: finite XY deltas from centered placement; NaN/NaN auto-places both axes; mixed finite/NaN is invalid');
  console.log('preparePlate JSON: [{scale:[3], rotation:[3], mirror:[3], offset:null|[x,y]}]');
  console.log(`evidence: auto=${JSON.stringify(auto.bounds)} shifted=${JSON.stringify(finite.bounds)} orderProbe=${JSON.stringify(orderProbe.bounds)}`);
  console.log(`statistics: schema=${auto.statistics.schemaVersion}; two-object ranges=PASS; per-object config=unsupported`);
} finally { module?.PThread?.terminateAllThreads?.(); }
