import type { Variant } from './manifest';

export const MT_MEMORY_PAGES = 16384; // 1 GiB fixed; build requires at least 4096 pages.
export const MT_THREADS = 4; // Engine pthread pool = hardwareConcurrency + 4.

export interface ProbeResult {
  variant: Variant;
  reason: string;
  memory?: WebAssembly.Memory;
}

export interface ProbeEnv {
  crossOriginIsolated?: boolean;
  hasSharedArrayBuffer?: boolean;
  createMemory?: (descriptor: WebAssembly.MemoryDescriptor) => WebAssembly.Memory;
  pages?: number;
}

export function probeThreading(env: ProbeEnv = {}): ProbeResult {
  if (!(env.crossOriginIsolated ?? globalThis.crossOriginIsolated === true)) {
    return { variant: 'st', reason: 'not cross-origin isolated' };
  }
  if (!(env.hasSharedArrayBuffer ?? typeof SharedArrayBuffer === 'function')) {
    return { variant: 'st', reason: 'SharedArrayBuffer unavailable' };
  }
  const pages = env.pages ?? MT_MEMORY_PAGES;
  if (!Number.isInteger(pages) || pages < 4096) throw new RangeError('pages must be an integer >= 4096');
  let memory: WebAssembly.Memory;
  try {
    memory = (env.createMemory ?? (descriptor => new WebAssembly.Memory(descriptor)))(
      { initial: pages, maximum: pages, shared: true },
    );
  } catch (error) {
    return { variant: 'st', reason: `shared memory allocation failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!(memory.buffer instanceof SharedArrayBuffer)) {
    return { variant: 'st', reason: 'memory is not shared' };
  }
  return { variant: 'mt', memory, reason: `fixed shared memory ${pages / 16} MiB` };
}
