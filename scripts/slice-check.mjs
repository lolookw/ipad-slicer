import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { initSession, sliceStl } from '../src/worker/engine-bridge.mjs';

globalThis.require ??= createRequire(import.meta.url);
globalThis.__dirname ??= '.';
globalThis.__filename ??= '';
const read = (path, encoding) => readFile(new URL(`../${path}`, import.meta.url), encoding);
const nodeRequire = globalThis.require;

function installPthreadBootstrap(jsPath) {
  const workerThreads = nodeRequire('node:worker_threads');
  class PthreadWorker extends workerThreads.Worker {
    constructor(filename, options) {
      if (filename !== jsPath) { super(filename, options); return; }
      // Cached .js inherits this repo's ESM scope, but Emscripten pthreads require CommonJS.
      const bootstrap = `
        const { Module } = require('node:module');
        const filename = ${JSON.stringify(jsPath)};
        const engine = new Module(filename);
        engine.filename = filename;
        engine.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
        engine._compile(require('node:fs').readFileSync(filename, 'utf8'), filename);
      `;
      super(bootstrap, { ...options, eval: true });
    }
  }
  globalThis.require = name => name === 'worker_threads' || name === 'node:worker_threads'
    ? { ...workerThreads, Worker: PthreadWorker } : nodeRequire(name);
}

function cube(profile, size) {
  const bed = profile.printable_area.map(point => point.split('x').map(Number));
  const center = [0, 1].map(axis => (Math.min(...bed.map(p => p[axis])) + Math.max(...bed.map(p => p[axis]))) / 2);
  const vertices = [[-10, -10, 0], [10, -10, 0], [10, 10, 0], [-10, 10, 0],
    [-10, -10, 20], [10, -10, 20], [10, 10, 20], [-10, 10, 20]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const facets = faces.map(face => `facet normal 0 0 0\nouter loop\n${face.map(index => {
    const [x, y, z] = vertices[index];
    return `vertex ${x * size / 20 + center[0]} ${y * size / 20 + center[1]} ${z * size / 20}`;
  }).join('\n')}\nendloop\nendfacet`).join('\n');
  return new TextEncoder().encode(`solid cube\n${facets}\nendsolid cube\n`);
}

function profileFromPack(value, processId, filamentId) {
  if (value.schema !== 1 || !Array.isArray(value.combos)) return value;
  const [defaultProcess, defaultFilament] = value.combos[0] ?? [];
  const selectedProcess = processId ?? defaultProcess;
  const selectedFilament = filamentId ?? defaultFilament;
  assert.ok(value.combos.some(([candidateProcess, candidateFilament]) =>
    candidateProcess === selectedProcess && candidateFilament === selectedFilament),
  'Requested catalog combination was not smoke-tested');
  const processPreset = value.processes.find(candidate => candidate.id === selectedProcess);
  const filament = value.filaments.find(candidate => candidate.id === selectedFilament);
  assert.ok(processPreset && filament, 'Catalog combination references a missing preset');
  return { ...value.machine, ...processPreset.settings, ...filament.settings,
    printer_settings_id: value.id, print_settings_id: processPreset.id,
    filament_settings_id: [filament.id] };
}

let module;
try {
  const { values } = parseArgs({ options: {
    variant: { type: 'string', default: 'st' }, size: { type: 'string', default: '20' },
    pack: { type: 'string', default: 'profiles/ender3v2-020-pla.json' },
    process: { type: 'string' }, filament: { type: 'string' },
  } });
  const variant = values.variant;
  const size = Number(values.size);
  assert.ok(variant === 'st' || variant === 'mt', '--variant must be st or mt');
  assert.ok(Number.isFinite(size) && size > 0, '--size must be a positive finite number');
  const profile = profileFromPack(JSON.parse(await readFile(resolve(values.pack), 'utf8')),
    values.process, values.filament);
  const cache = `.engine-cache/wasm-v2.4.2-patch19${variant === 'mt' ? '-multithreaded' : ''}`;
  const engine = variant === 'mt' ? 'slicer-mt' : 'slicer';
  const js = await read(`${cache}/${engine}.js`, 'utf8');
  const threading = {};
  if (variant === 'mt') {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { hardwareConcurrency: 4 } });
    threading.mainScriptUrlOrBlob = fileURLToPath(new URL(`../${cache}/${engine}.js`, import.meta.url));
    threading.wasmMemory = new WebAssembly.Memory({ initial: 16384, maximum: 16384, shared: true });
    installPthreadBootstrap(threading.mainScriptUrlOrBlob);
  }
  const { default: factory } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(`${js}\nexport default OrcaModule;`));
  module = await factory({ ...threading, wasmBinary: await read(`${cache}/${engine}.wasm`),
    print: () => {}, printErr: console.warn, onAbort: reason => { throw new Error(`OrcaWasm aborted: ${reason}`); } });
  const session = initSession(module, JSON.stringify(profile));
  try {
    const stl = cube(profile, size);
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
    console.log(JSON.stringify({ variant, size, sliceMs, gcodeBytes: bytes.byteLength,
      memoryBytes: module.HEAPU8.buffer.byteLength, layerCountEstimate: layers, temperatures }, null, 2));
  } finally { module._onewasm_session_destroy(session); }
} catch (error) {
  console.error(`Slice check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  globalThis.require = nodeRequire;
  module?.PThread?.terminateAllThreads?.();
}
// The build may not export PThread; force cleanup after flushing piped output.
process.stdout.write('', () => process.stderr.write('', () => process.exit(process.exitCode ?? 0)));
