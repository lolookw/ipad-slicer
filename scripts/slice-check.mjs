import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initSession, sliceStl } from '../src/worker/engine-bridge.mjs';

globalThis.require ??= createRequire(import.meta.url);
globalThis.__dirname ??= '.';
globalThis.__filename ??= '';
const read = (path, encoding) => readFile(new URL(`../${path}`, import.meta.url), encoding);

function cube(profile) {
  const bed = profile.printable_area.map(point => point.split('x').map(Number));
  const center = [0, 1].map(axis => (Math.min(...bed.map(p => p[axis])) + Math.max(...bed.map(p => p[axis]))) / 2);
  const vertices = [[-10, -10, 0], [10, -10, 0], [10, 10, 0], [-10, 10, 0],
    [-10, -10, 20], [10, -10, 20], [10, 10, 20], [-10, 10, 20]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const facets = faces.map(face => `facet normal 0 0 0\nouter loop\n${face.map(index => {
    const [x, y, z] = vertices[index];
    return `vertex ${x + center[0]} ${y + center[1]} ${z}`;
  }).join('\n')}\nendloop\nendfacet`).join('\n');
  return new TextEncoder().encode(`solid cube\n${facets}\nendsolid cube\n`);
}

try {
  const profile = JSON.parse(await read('profiles/ender3v2-020-pla.json', 'utf8'));
  const cache = '.engine-cache/wasm-v2.4.2-patch19';
  const js = await read(`${cache}/slicer.js`, 'utf8');
  const { default: factory } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(`${js}\nexport default OrcaModule;`));
  const module = await factory({ wasmBinary: await read(`${cache}/slicer.wasm`),
    print: () => {}, printErr: console.warn, onAbort: reason => { throw new Error(`OrcaWasm aborted: ${reason}`); } });
  const session = initSession(module, JSON.stringify(profile));
  try {
    const stl = cube(profile);
    const start = performance.now();
    const bytes = sliceStl(module, session, stl);
    const sliceMs = performance.now() - start;
    const gcode = new TextDecoder().decode(bytes);
    assert.ok(bytes.byteLength > 0, 'G-code is empty');
    assert.match(gcode, /^G1\s/m, 'Missing layer moves');
    assert.match(gcode, /^G28\b/m, 'Missing Marlin homing sequence');
    const temperatures = Object.fromEntries(['M104', 'M109', 'M140', 'M190'].map(command =>
      [command, [...gcode.matchAll(new RegExp(`^${command}\\b[^;\\r\\n]*?\\b[SR]([0-9]+(?:\\.[0-9]+)?)`, 'gm'))].map(match => Number(match[1]))]));
    const nozzle = Number([profile.nozzle_temperature_initial_layer].flat()[0]);
    assert.ok(nozzle > 0 && temperatures.M104.includes(nozzle) && temperatures.M109.includes(nozzle), 'Nozzle temperatures do not match profile');
    assert.ok(temperatures.M140.some(value => value > 0) && temperatures.M190.some(value => value > 0), 'Missing non-zero bed temperatures');
    const layers = (gcode.match(/^;LAYER_CHANGE\b/gm) ?? []).length;
    console.log(JSON.stringify({ sliceMs, gcodeBytes: bytes.byteLength, layerCountEstimate: layers, temperatures }, null, 2));
  } finally { module._onewasm_session_destroy(session); }
} catch (error) {
  console.error(`Slice check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
