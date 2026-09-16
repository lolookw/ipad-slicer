import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initSession, sliceStl } from '../../src/worker/engine-bridge.mjs';
import { resolvePack } from './build-catalog.mjs';
import { createPresetSource } from './resolve.mjs';

globalThis.require ??= createRequire(import.meta.url);
globalThis.__dirname ??= '.';
globalThis.__filename ??= '';

function cube(profile) {
  const bed = profile.printable_area.map(point => point.split('x').map(Number));
  const cx = (Math.min(...bed.map(p => p[0])) + Math.max(...bed.map(p => p[0]))) / 2;
  const cy = (Math.min(...bed.map(p => p[1])) + Math.max(...bed.map(p => p[1]))) / 2;
  const vertices = [[-10,-10,0],[10,-10,0],[10,10,0],[-10,10,0],[-10,-10,20],[10,-10,20],[10,10,20],[-10,10,20]];
  const faces = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  const facets = faces.map(face => `facet normal 0 0 0\nouter loop\n${face.map(i =>
    `vertex ${vertices[i][0] + cx} ${vertices[i][1] + cy} ${vertices[i][2]}`).join('\n')}\nendloop\nendfacet`).join('\n');
  return new TextEncoder().encode(`solid cube\n${facets}\nendsolid cube\n`);
}

const config = JSON.parse(await readFile('catalog.config.json'));
const lock = JSON.parse(await readFile('engine.lock.json'));
const root = `.engine-cache/${config.engineRelease}`;
const jsBytes = await readFile(`${root}/slicer.js`);
const wasm = await readFile(`${root}/slicer.wasm`);
for (const [name, bytes] of [['js', jsBytes], ['wasm', wasm]])
  assert.equal(createHash('sha256').update(bytes).digest('hex'), lock.variants.st[name].sha256, `Pinned engine ${name} hash`);
const { default: factory } = await import('data:text/javascript;charset=utf-8,' +
  encodeURIComponent(`${jsBytes}\nexport default OrcaModule;`));
const module = await factory({ wasmBinary: wasm, print: () => {}, printErr: () => {},
  onAbort: reason => { throw new Error(`OrcaWasm aborted: ${reason}`); } });
const source = createPresetSource();
const targets = config.vendors.flatMap(vendor => vendor.models.map(model => ({ owner: vendor, model })))
  .concat({ owner: { id: 'custom', source: config.customBase.source },
    model: { ...config.customBase, required: true, nozzle: 0.4 } });
const results = [];
try {
  for (const { owner, model } of targets) {
    const resolved = await resolvePack(source, owner, model);
    for (const process of resolved.processes) for (const filament of resolved.filaments) {
      const combo = `${model.id}:${process.id}:${filament.id}`;
      const profile = { ...resolved.machine, ...process.settings, ...filament.settings,
        printer_settings_id: model.machine, print_settings_id: process.id, filament_settings_id: [filament.id] };
      const started = performance.now();
      let session;
      try {
        session = initSession(module, JSON.stringify(profile));
        const bytes = sliceStl(module, session, cube(profile));
        const text = new TextDecoder().decode(bytes);
        assert.ok(bytes.byteLength > 1000 && /^G[01]\s/m.test(text), 'Incomplete G-code');
        results.push({ combo, pass: true, durationMs: Math.round(performance.now() - started), gcodeBytes: bytes.byteLength });
      } catch (error) {
        results.push({ combo, pass: false, durationMs: Math.round(performance.now() - started),
          error: error instanceof Error ? error.message : String(error) });
      } finally { if (session) module._onewasm_session_destroy(session); }
    }
  }
} finally { module?.PThread?.terminateAllThreads?.(); }
await writeFile('.engine-cache/catalog-smoke-results.json', `${JSON.stringify(results, null, 2)}\n`);
for (const { model } of targets)
  if (!results.some(result => result.pass && result.combo.startsWith(`${model.id}:`)))
    throw new Error(`Required model has no passing combinations: ${model.id}`);
const passed = results.filter(result => result.pass).length;
console.log(`Catalog smoke: ${passed}/${results.length} combinations passed with ${config.engineRelease}`);
