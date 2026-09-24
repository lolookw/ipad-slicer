import { fetchEngineManifest, type Variant } from '../engine/manifest';
import { MT_THREADS, probeThreading, type ProbeResult } from '../engine/probe';
import { createInstantiateWasm } from '../engine/stream-loader';
import { getLastStatistics, initSession, preparePlate, sliceStlMulti, type OrcaModule } from './engine-bridge.mjs';
import { isToWorker, type FromWorker } from './protocol';
import { WorkerMeshCache } from './mesh-cache';

type Stage = Extract<FromWorker, { t: 'error' }>['stage'];
const post = (message: FromWorker, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
let engine: OrcaModule | undefined;
let configuredSession = 0;
let configuredHash: string | undefined;
let loading = false;
const meshes = new WorkerMeshCache();

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
    engine = module;
    post({ t: 'ready', variant: probe.variant, ...info, probe: probe.reason });
  } finally { URL.revokeObjectURL(url); }
}

function requireEngine(): OrcaModule {
  if (!engine) throw new Error('Engine is not ready');
  return engine;
}

function configure(module: OrcaModule, hash: string, nativeJson: string): void {
  if (configuredSession && configuredHash === hash) return;
  const next = initSession(module, nativeJson);
  const previous = configuredSession;
  configuredSession = next;
  configuredHash = hash;
  if (previous) module._onewasm_session_destroy(previous);
}

/**
 * A failed prepare/slice call (a genuine engine crash, or the engine's own "session already has an
 * active operation" guard after one) leaves the session internally marked busy forever; nothing else
 * ever clears that flag. Without this, `configure()`'s same-hash fast path (line above) would keep
 * reusing that same wedged session on every later attempt — even a fresh 'config' message for the
 * unchanged printer/filament reuses it, since the hash didn't change — permanently blocking any
 * further slice until the whole app reloads. Destroying the session and clearing the globals here
 * forces the next `configure()` call to build a brand new one, regardless of whether the hash matches.
 */
function resetSessionAfterFailure(module: OrcaModule): void {
  if (!configuredSession) return;
  try { module._onewasm_session_destroy(configuredSession); } catch { /* best-effort: the module may already consider it gone */ }
  configuredSession = 0;
  configuredHash = undefined;
}

async function readMeshes(generation: number, objects: { meshId: string }[]): Promise<Uint8Array[]> {
  return meshes.read(generation, objects.map(object => object.meshId));
}

async function handleV2(message: Exclude<import('./protocol').ToWorker, { t: 'init' }>): Promise<void> {
  const module = requireEngine();
  if (message.t === 'config') {
    configure(module, message.configHash, message.nativeJson);
    post({ t: 'accepted', requestId: message.requestId, kind: 'config' });
  } else if (message.t === 'mesh') {
    meshes.put(message.generation, message.meshId, message.blob);
    post({ t: 'accepted', requestId: message.requestId, kind: 'mesh', generation: message.generation });
  } else if (message.t === 'releaseMesh') {
    meshes.release(message.generation, message.meshId);
    post({ t: 'accepted', requestId: message.requestId, kind: 'releaseMesh', generation: message.generation });
  } else if (message.t === 'preparePlate' || message.t === 'sliceMulti') {
    if (!configuredSession || configuredHash !== message.configHash) throw new Error(`Missing configuration ${message.configHash}`);
    // Capture the validated session/hash before the only await in this branch: a concurrent
    // 'config' message for a different hash can reassign (and destroy) configuredSession while
    // readMeshes is pending. Re-checking after the await, rather than re-reading the globals,
    // stops this operation from silently running under another request's session.
    const session = configuredSession, hash = configuredHash;
    const bytes = await readMeshes(message.generation, message.objects);
    if (configuredSession !== session || configuredHash !== hash) {
      throw new Error(`Configuration changed to ${configuredHash ?? 'none'} while ${message.configHash} was in flight`);
    }
    const transforms = new Float32Array(message.objects.length * 11);
    message.objects.forEach((object, index) => transforms.set(object.transform, index * 11));
    // A throw from any of these three calls (a genuine engine crash, or the engine's own busy guard
    // after one) can leave the session wedged; see resetSessionAfterFailure's own comment. The
    // session is not trustworthy after ANY failure here, so every one of them resets it, not just
    // ones that look session-related — we cannot tell from the outside which failures corrupt state.
    try {
      if (message.t === 'preparePlate') {
        const result = preparePlate(module, session, bytes, transforms, message.operation);
        post({ t: 'preparePlateResult', requestId: message.requestId, transforms: result as import('../viewer/transforms').EngineTransform[] });
      } else {
        const started = performance.now();
        const gcode = sliceStlMulti(module, session, bytes, transforms, Int32Array.from(message.objects.map(object => object.extruderId)));
        post({ t: 'sliceMultiResult', requestId: message.requestId, gcode, statistics: getLastStatistics(module, session),
          sliceMs: performance.now() - started, peakHeapBytes: module.HEAPU8.buffer.byteLength }, [gcode]);
      }
    } catch (error) {
      resetSessionAfterFailure(module);
      throw error;
    }
  } else if (message.t === 'getStatistics') {
    if (!configuredSession) throw new Error('No configured session');
    post({ t: 'statisticsResult', requestId: message.requestId, statistics: getLastStatistics(module, configuredSession) });
  } else {
    post({ t: 'accepted', requestId: message.requestId, kind: 'cancel' });
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
      const requestStage = event.data.t === 'preparePlate' ? 'prepare' : event.data.t === 'getStatistics' ? 'statistics' :
        event.data.t === 'sliceMulti' ? 'slice' : event.data.t === 'releaseMesh' ? 'mesh' : event.data.t;
      try { await handleV2(event.data); }
      catch (error) { post({ t: 'requestError', requestId: event.data.requestId, stage: requestStage, message: error instanceof Error ? error.message : String(error) }); }
    }
  } catch (error) {
    post({ t: 'error', stage, message: error instanceof Error ? error.message : String(error) });
  }
});
