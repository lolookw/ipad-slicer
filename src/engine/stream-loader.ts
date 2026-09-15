import type { EngineManifest, Variant } from './manifest';

type Entry = EngineManifest['variants'][Variant];
type LoadInfo = { loadPath: 'streaming' | 'buffered'; loadMs: number };

function fromIterator(iterator: AsyncGenerator<Uint8Array<ArrayBuffer>>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (result.done) controller.close();
        else controller.enqueue(result.value);
      } catch (error) { controller.error(error); }
    },
    async cancel() { await iterator.return(undefined); },
  });
}

async function* read(stream: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function streamWasmBytes(variant: Entry, fetchImpl = fetch): ReadableStream<Uint8Array<ArrayBuffer>> {
  async function* parts() {
    for (const url of variant.parts) {
      const response = await fetchImpl(url);
      if (!response.ok || !response.body) throw new Error(`WASM part request failed: ${url} (${response.status})`);
      yield* read(response.body);
    }
  }
  async function* decoded() {
    const iterator = parts();
    const prefix: Uint8Array<ArrayBuffer>[] = [];
    const magic: number[] = [];
    try {
      while (magic.length < 4) {
        const next = await iterator.next();
        if (next.done) break;
        prefix.push(next.value);
        for (const byte of next.value.subarray(0, 4 - magic.length)) magic.push(byte);
      }
      const stream = fromIterator((async function* () { yield* prefix; yield* iterator; })());
      const alreadyDecoded = magic.every((byte, index) => byte === [0, 97, 115, 109][index]) && magic.length === 4;
      yield* read(alreadyDecoded ? stream : stream.pipeThrough(new DecompressionStream('gzip')));
    } finally { await iterator.return(undefined); }
  }
  return fromIterator(variant.encoding === 'gzip' ? decoded() : parts());
}

export function createInstantiateWasm(variant: Entry, options: {
  fetchImpl?: typeof fetch;
  onLoaded?: (info: LoadInfo) => void;
} = {}) {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const completion = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  // Emscripten cannot catch asynchronous failures. Observe hook.completion alongside
  // OrcaModule's promise (e.g. Promise.all); rejection carries the thrown load error.
  const hook = (imports: WebAssembly.Imports, receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => {
    void (async () => {
      const start = performance.now();
      let loadPath: LoadInfo['loadPath'] = 'streaming';
      let result: WebAssembly.WebAssemblyInstantiatedSource;
      const stream = streamWasmBytes(variant, options.fetchImpl);
      try {
        result = await WebAssembly.instantiateStreaming(new Response(stream, { headers: { 'Content-Type': 'application/wasm' } }), imports);
      } catch {
        if (!stream.locked) await stream.cancel().catch(() => {});
        loadPath = 'buffered';
        const bytes = await new Response(streamWasmBytes(variant, options.fetchImpl)).arrayBuffer();
        result = await WebAssembly.instantiate(bytes, imports);
      }
      receiveInstance(result.instance, result.module);
      options.onLoaded?.({ loadPath, loadMs: performance.now() - start });
    })().then(resolve, reject);
    return {};
  };
  return Object.assign(hook, { completion });
}
