import profile from '../../profiles/ender3v2-020-pla.json';
import { fetchEngineManifest, type Variant } from '../engine/manifest';
import { MT_THREADS, probeThreading, type ProbeResult } from '../engine/probe';
import { createInstantiateWasm } from '../engine/stream-loader';
import { checkStatus, initSession, sliceStl, type OrcaModule } from './engine-bridge.mjs';
import { isToWorker, type FromWorker } from './protocol';

type Stage = Extract<FromWorker, { t: 'error' }>['stage'];
const post = (message: FromWorker, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
let engine: OrcaModule | undefined;
let session = 0;
let loading = false;

function chooseVariant(prefer: Variant): ProbeResult {
  return prefer === 'mt' ? probeThreading() : { variant: 'st', reason: 'single-thread requested' };
}

async function initialize(prefer: Variant, setStage: (stage: Stage) => void) {
  const manifest = await fetchEngineManifest();
  setStage('probe');
  const probe = chooseVariant(prefer);
  setStage('load');
  const variant = manifest.variants[probe.variant];
  const jsUrl = new URL(variant.js, self.location.href).href;
  const response = await fetch(jsUrl);
  if (!response.ok) throw new Error(`Engine JavaScript request failed (${response.status})`);
  const url = URL.createObjectURL(new Blob([await response.text(), '\nexport default OrcaModule;'], { type: 'text/javascript' }));
  try {
    const { default: factory } = await import(/* @vite-ignore */ url);
    let info = { loadPath: 'streaming' as 'streaming' | 'buffered', loadMs: 0 };
    const hook = createInstantiateWasm(variant, { onLoaded: loaded => { info = loaded; } });
    let rejectAbort!: (reason: Error) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const options: Record<string, unknown> = {
      instantiateWasm: hook, print: console.log, printErr: console.error,
      onAbort: (reason: unknown) => rejectAbort(new Error(`OrcaWasm aborted: ${String(reason)}`)),
    };
    if (probe.variant === 'mt') {
      // Fixed shared memory avoids the growable-shared-memory crash on iPadOS 26.2 (research R2).
      options.wasmMemory = probe.memory;
      // Pthread workers load the raw classic script, not the Blob module wrapper.
      options.mainScriptUrlOrBlob = jsUrl;
      // The build sizes its pthread pool as hardwareConcurrency + 4; cap it for iPad memory.
      Object.defineProperty(self.navigator, 'hardwareConcurrency', { value: MT_THREADS, configurable: true });
    }
    const modulePromise = Promise.resolve().then(() => factory(options)) as Promise<OrcaModule>;
    const [module] = await Promise.race([Promise.all([modulePromise, hook.completion]), aborted]);
    setStage('profile');
    session = initSession(module, JSON.stringify(profile));
    engine = module;
    post({ t: 'ready', variant: probe.variant, ...info, probe: probe.reason });
  } finally { URL.revokeObjectURL(url); }
}

function slice(module: OrcaModule, stl: ArrayBuffer, setStage: (stage: Stage) => void) {
  let peakHeapBytes = 0;
  const progress = (pct: number, text?: string) => {
    const heapBytes = module.HEAPU8.buffer.byteLength;
    peakHeapBytes = Math.max(peakHeapBytes, heapBytes);
    post({ t: 'progress', pct, heapBytes, stage: text });
  };
  let callback = 0;
  try {
    if (module.addFunction) {
      callback = module.addFunction((pct, text) => progress(pct, text ? module.UTF8ToString(text) : undefined), 'viii');
      checkStatus(module, session, module._onewasm_set_progress_callback(session, callback, 0));
    }
    progress(0);
    const start = performance.now();
    const gcode = sliceStl(module, session, new Uint8Array(stl));
    const sliceMs = performance.now() - start;
    progress(100);
    setStage('export');
    post({ t: 'done', gcode, sliceMs, peakHeapBytes }, [gcode]);
  } finally {
    if (callback) {
      module._onewasm_set_progress_callback(session, 0, 0);
      module.removeFunction?.(callback);
    }
  }
}

self.addEventListener('message', async (event: MessageEvent<unknown>) => {
  let stage: Stage = 'load';
  const setStage = (next: Stage) => { stage = next; };
  try {
    if (!isToWorker(event.data)) throw new Error('Invalid worker message');
    if (event.data.t === 'init') {
      if (loading || engine) throw new Error('Engine already initialized or loading');
      loading = true;
      try { await initialize(event.data.prefer, setStage); } finally { loading = false; }
    } else {
      stage = 'slice';
      if (!engine) throw new Error('Engine is not ready');
      slice(engine, event.data.stl, setStage);
    }
  } catch (error) {
    post({ t: 'error', stage, message: error instanceof Error ? error.message : String(error) });
  }
});
