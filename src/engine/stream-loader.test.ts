// @ts-expect-error Node runtime is available, but this browser project has no @types/node dependency.
import { gzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import type { EngineManifest } from './manifest';
import { createInstantiateWasm, streamWasmBytes } from './stream-loader';

const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const variant: EngineManifest['variants']['st'] = { js: '/slicer.js', encoding: 'identity', parts: ['/0', '/1', '/2'], wasmBytes: 8 };
function fixture(bytes = wasm, encoding: 'gzip' | 'identity' = 'identity') {
  const chunks = [bytes.slice(0, 1), bytes.slice(1, 3), bytes.slice(3)];
  const fetchImpl = vi.fn<typeof fetch>(async url => new Response(chunks[Number(String(url).slice(1))]!));
  return { entry: { ...variant, encoding }, fetchImpl };
}
afterEach(() => vi.restoreAllMocks());

it.each(['identity', 'gzip', 'decoded'] as const)('streams multipart %s bytes, including split magic', async mode => {
  const { entry, fetchImpl } = fixture(mode === 'gzip' ? new Uint8Array(gzipSync(wasm)) : wasm, mode === 'identity' ? 'identity' : 'gzip');
  const result = await new Response(streamWasmBytes(entry, fetchImpl)).arrayBuffer();
  expect(new Uint8Array(result)).toEqual(wasm);
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(variant.parts);
});

it('rejects a non-ok part response', async () => {
  const fetchImpl: typeof fetch = async () => new Response(null, { status: 503 });
  await expect(new Response(streamWasmBytes(variant, fetchImpl)).arrayBuffer()).rejects.toThrow('/0 (503)');
});

it.each(['streaming', 'buffered'] as const)('instantiates via %s and passes the compiled module', async loadPath => {
  if (loadPath === 'buffered') vi.spyOn(WebAssembly, 'instantiateStreaming').mockRejectedValue(new Error('streaming unavailable'));
  const { entry, fetchImpl } = fixture();
  const receive = vi.fn();
  const onLoaded = vi.fn();
  const hook = createInstantiateWasm(entry, { fetchImpl, onLoaded });
  expect(hook({}, receive)).toEqual({});
  await hook.completion;
  expect(receive).toHaveBeenCalledExactlyOnceWith(expect.any(WebAssembly.Instance), expect.any(WebAssembly.Module));
  expect(onLoaded).toHaveBeenCalledExactlyOnceWith({ loadPath, loadMs: expect.any(Number) });
  expect(onLoaded.mock.calls[0]![0].loadMs).toBeGreaterThanOrEqual(0);
  expect(fetchImpl.mock.calls.filter(([url]) => url === '/0').length).toBe(loadPath === 'buffered' ? 2 : 1);
});

it('exposes both-path failure through the completion promise', async () => {
  const { entry, fetchImpl } = fixture(new Uint8Array([1, 2, 3, 4]));
  const receive = vi.fn();
  const hook = createInstantiateWasm(entry, { fetchImpl });
  hook({}, receive);
  await expect(hook.completion).rejects.toThrow();
  expect(receive).not.toHaveBeenCalled();
});

it('does not retry a successful instantiation when the receiving callback throws', async () => {
  const { entry, fetchImpl } = fixture();
  const receive = vi.fn(() => { throw new Error('receiver failed'); });
  const hook = createInstantiateWasm(entry, { fetchImpl });
  hook({}, receive);
  await expect(hook.completion).rejects.toThrow('receiver failed');
  expect(receive).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
