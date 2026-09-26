
import type { ImportedObject, ImportModelResult, ModelFormat } from './import-types';
import { repairMesh } from './mesh-repair';
import { parseStlBuffer, type ImportStlResult } from './stl-parse';

export type { MeshBuffers } from './geometry-cache';
export type { LocalBounds } from './transforms';
export type { ImportStlResult } from './stl-parse';
export type { ImportedObject, ImportModelResult, ModelFormat } from './import-types';


export interface ImportOptions { maxTriangles?: number }
type WorkerRequest = { buffer: ArrayBuffer; format: ModelFormat; maxTriangles?: number };

/** Chooses the parser from the extension, falling back to the zip signature; anything else is treated as STL. */
export function detectModelFormat(name: string, buffer: ArrayBuffer): ModelFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith('.3mf')) return '3mf';
  if (lower.endsWith('.stl')) return 'stl';
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4 ? '3mf' : 'stl';
}

/** Runs automatic mesh repair on every object's buffers, the single choke point both STL and 3MF
 * imports converge through — the engine and viewer only ever see the repaired result. */
function repairObjects(objects: ImportedObject[]): ImportedObject[] {
  return objects.map(object => {
    const { meshBuffers, report } = repairMesh(object.meshBuffers);
    return { ...object, meshBuffers, repairReport: report };
  });
}

async function parseBuffer(request: WorkerRequest): Promise<ImportModelResult> {
  if (request.format === '3mf') {
    // Lazy chunk: the zip library only loads when a 3MF is actually imported.
    const { parse3mfBuffer } = await import('./threemf-parse');
    const result = parse3mfBuffer(request.buffer, { maxTriangles: request.maxTriangles });
    return result.ok ? { ...result, objects: repairObjects(result.objects) } : result;
  }
  const result = parseStlBuffer(request.buffer);
  return result.ok ? { ok: true, format: 'stl', objects: repairObjects([{ meshBuffers: result.meshBuffers }]) } : result;
}

function parseInWorker(request: WorkerRequest): Promise<ImportModelResult> {
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
    worker.onmessage = (event: MessageEvent<ImportModelResult>) => {
      worker.terminate();
      resolve(event.data);
    };

    // The buffer is copied (not transferred) so the synchronous fallback still has it if the worker fails.
    worker.postMessage(request satisfies WorkerRequest);
  });
}

/** Imports an STL or 3MF in a worker when available, falling back to the main thread. */
export async function importModelFile(file: File, options: ImportOptions = {}): Promise<ImportModelResult> {
  try {
    const buffer = await file.arrayBuffer();
    const request: WorkerRequest = { buffer, format: detectModelFormat(file.name, buffer), maxTriangles: options.maxTriangles };
    try {
      return await parseInWorker(request);
    } catch {
      return await parseBuffer(request);
    }
  } catch {
    return { ok: false, error: { code: 'stl-read-failed' } };
  }
}

/** STL-only entry point kept for callers that expect a single mesh. */
export async function importStlFile(file: File): Promise<ImportStlResult> {
  try {
    const buffer = await file.arrayBuffer();
    try {
      const result = await parseInWorker({ buffer, format: 'stl' });
      const first: ImportedObject | undefined = result.ok ? result.objects[0] : undefined;
      return result.ok ? (first ? { ok: true, meshBuffers: first.meshBuffers } : parseStlBuffer(buffer)) : result;
    } catch {
      return parseStlBuffer(buffer);
    }
  } catch {
    return { ok: false, error: { code: 'stl-read-failed' } };
  }
}

const isWorkerScope = typeof document === 'undefined' && typeof globalThis.postMessage === 'function';

if (isWorkerScope) {
  globalThis.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const result = await parseBuffer(event.data);
    if (!result.ok) {
      globalThis.postMessage(result);
      return;
    }
    const transfer: ArrayBuffer[] = [];
    for (const { meshBuffers } of result.objects) transfer.push(meshBuffers.positions.buffer as ArrayBuffer, meshBuffers.normals.buffer as ArrayBuffer);
    globalThis.postMessage(result, { transfer });
  };
}
