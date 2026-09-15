import { afterEach, expect, it, vi } from 'vitest';
import { MT_MEMORY_PAGES, MT_THREADS, probeThreading } from './probe';

const available = { crossOriginIsolated: true, hasSharedArrayBuffer: true };
const fakeMemory = (buffer: ArrayBufferLike) => ({ buffer }) as WebAssembly.Memory;
afterEach(() => vi.unstubAllGlobals());

it('checks isolation before availability, pages and allocation', () => {
  const createMemory = vi.fn();
  expect(probeThreading({ crossOriginIsolated: false, hasSharedArrayBuffer: false, pages: 0, createMemory }))
    .toEqual({ variant: 'st', reason: 'not cross-origin isolated' });
  expect(createMemory).not.toHaveBeenCalled();
});

it('checks SharedArrayBuffer before pages and allocation', () => {
  const createMemory = vi.fn();
  expect(probeThreading({ crossOriginIsolated: true, hasSharedArrayBuffer: false, pages: 0, createMemory }))
    .toEqual({ variant: 'st', reason: 'SharedArrayBuffer unavailable' });
  expect(createMemory).not.toHaveBeenCalled();
});

it.each([4095, 4096.5, NaN, Infinity])('rejects invalid page count %s without allocating', pages => {
  const createMemory = vi.fn();
  expect(() => probeThreading({ ...available, pages, createMemory })).toThrow(RangeError);
  expect(createMemory).not.toHaveBeenCalled();
});

it.each([new Error('allocation denied'), 'allocation denied'])('reports allocation failures: %s', error => {
  expect(probeThreading({ ...available, createMemory: () => { throw error; } }))
    .toEqual({ variant: 'st', reason: 'shared memory allocation failed: allocation denied' });
});

it('rejects memory backed by an ordinary buffer', () => {
  expect(probeThreading({ ...available, createMemory: () => fakeMemory(new ArrayBuffer(8)) }))
    .toEqual({ variant: 'st', reason: 'memory is not shared' });
});

it.each([4096, MT_MEMORY_PAGES])('allocates fixed memory once and returns the same object for %s pages', pages => {
  const memory = fakeMemory(new SharedArrayBuffer(8));
  const createMemory = vi.fn(() => memory);
  const result = probeThreading({ ...available, pages, createMemory });
  expect(result).toEqual({ variant: 'mt', memory, reason: `fixed shared memory ${pages / 16} MiB` });
  expect(result.memory).toBe(memory);
  expect(createMemory).toHaveBeenCalledExactlyOnceWith({ initial: pages, maximum: pages, shared: true });
});

it('defaults to global capabilities and the fixed 1 GiB target', () => {
  vi.stubGlobal('crossOriginIsolated', true);
  const createMemory = vi.fn(() => fakeMemory(new SharedArrayBuffer(8)));
  expect(probeThreading({ createMemory }).reason).toBe('fixed shared memory 1024 MiB');
  expect(createMemory).toHaveBeenCalledExactlyOnceWith({ initial: 16384, maximum: 16384, shared: true });
  expect(MT_THREADS).toBe(4);
  vi.stubGlobal('SharedArrayBuffer', undefined);
  expect(probeThreading().reason).toBe('SharedArrayBuffer unavailable');
  vi.stubGlobal('crossOriginIsolated', undefined);
  expect(probeThreading().reason).toBe('not cross-origin isolated');
});
