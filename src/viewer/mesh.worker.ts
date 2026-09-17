import type { MeshBuffers } from './geometry-cache';
import { parseStlBuffer, type ImportStlResult } from './stl-parse';

export type { MeshBuffers } from './geometry-cache';
export type { LocalBounds } from './transforms';
export type { ImportStlResult } from './stl-parse';

type WorkerRequest = { buffer: ArrayBuffer };

function parseInWorker(buffer: ArrayBuffer): Promise<MeshBuffers> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(error);
      return;
    }

    const fail = (error: unknown) => {
      worker.terminate();
      reject(error);
    };

    worker.onerror = () => fail(new Error('worker-failed'));
    worker.onmessageerror = () => fail(new Error('worker-unreadable'));
    worker.onmessage = (event: MessageEvent<ImportStlResult>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.meshBuffers);
      else reject(new Error(event.data.error.code));
    };

    // Keep the source buffer available for the synchronous fallback if the worker fails.
    worker.postMessage({ buffer } satisfies WorkerRequest);
  });
}

/** Imports an STL in a worker when available, falling back to the main thread. */
export async function importStlFile(file: File): Promise<ImportStlResult> {
  try {
    const buffer = await file.arrayBuffer();
    try {
      return { ok: true, meshBuffers: await parseInWorker(buffer) };
    } catch {
      return parseStlBuffer(buffer);
    }
  } catch {
    return { ok: false, error: { code: 'stl-read-failed' } };
  }
}

const isWorkerScope = typeof document === 'undefined' && typeof globalThis.postMessage === 'function';

if (isWorkerScope) {
  globalThis.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const result = parseStlBuffer(event.data.buffer);
    if (!result.ok) {
      globalThis.postMessage(result);
      return;
    }

    const { positions, normals } = result.meshBuffers;
    globalThis.postMessage(result, { transfer: [positions.buffer, normals.buffer] });
  };
}
