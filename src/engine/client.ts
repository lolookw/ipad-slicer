import type { Variant } from './manifest';
import { isFromWorker, type FromWorker, type PlateObjectMessage, type ToWorker } from '../worker/protocol';
import type { EngineTransform } from '../viewer/transforms';
import { binaries } from '../app/stores';

type Pending = { resolve: (message: FromWorker) => void; reject: (reason: Error) => void };
export type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;
type RequestMessage = Exclude<ToWorker, { t: 'init' | 'slice' }>;
type WithoutRequestId<T> = T extends { requestId: string } ? Omit<T, 'requestId'> : never;

export class EngineClient {
  private worker?: WorkerLike;
  private generation = 0;
  private uploaded = new Map<string, number>();
  private pending = new Map<string, Pending>();
  private ready?: Promise<void>;

  constructor(private readonly source: (meshId: string) => Blob | undefined,
    private readonly createWorker: () => WorkerLike = () => new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' })) {}

  private onMessage = (event: MessageEvent<unknown>) => {
    if (!isFromWorker(event.data)) return;
    if (event.data.t === 'ready') return;
    if ('requestId' in event.data) {
      const pending = this.pending.get(event.data.requestId);
      if (!pending) return;
      this.pending.delete(event.data.requestId);
      if (event.data.t === 'requestError') pending.reject(new Error(event.data.message)); else pending.resolve(event.data);
    }
  };

  private ensureWorker(prefer: Variant = 'st'): Promise<void> {
    if (this.ready) return this.ready;
    const worker = this.createWorker();
    this.worker = worker; this.generation++; this.uploaded.clear();
    worker.addEventListener('message', this.onMessage);
    this.ready = new Promise((resolve, reject) => {
      const ready = (event: MessageEvent<unknown>) => {
        if (!isFromWorker(event.data)) return;
        if (event.data.t === 'ready') { worker.removeEventListener('message', ready); resolve(); }
        else if (event.data.t === 'error') { worker.removeEventListener('message', ready); reject(new Error(event.data.message)); }
      };
      worker.addEventListener('message', ready);
      worker.postMessage({ t: 'init', prefer } satisfies ToWorker);
    });
    return this.ready;
  }

  private async request(message: WithoutRequestId<RequestMessage>): Promise<FromWorker> {
    await this.ensureWorker();
    const requestId = crypto.randomUUID();
    const response = new Promise<FromWorker>((resolve, reject) => this.pending.set(requestId, { resolve, reject }));
    this.worker!.postMessage({ ...message, requestId } as ToWorker);
    return response;
  }

  private async upload(objects: readonly PlateObjectMessage[]): Promise<void> {
    for (const { meshId } of objects) if (this.uploaded.get(meshId) !== this.generation) {
      const blob = this.source(meshId); if (!blob) throw new Error(`Missing mesh ${meshId}`);
      await this.request({ t: 'mesh', meshId, generation: this.generation, blob });
      this.uploaded.set(meshId, this.generation);
    }
  }

  async prepare(nativeJson: string, objects: readonly PlateObjectMessage[], operation: 1 | 2 | 3): Promise<EngineTransform[]> {
    await this.ensureWorker();
    const configHash = await sha256(nativeJson);
    await this.request({ t: 'config', configHash, nativeJson });
    await this.upload(objects);
    const result = await this.request({ t: 'preparePlate', configHash, generation: this.generation, operation, objects: [...objects] });
    if (result.t !== 'preparePlateResult' || result.transforms.length !== objects.length) throw new Error('Invalid preparation result');
    return result.transforms;
  }

  async releaseMesh(meshId: string): Promise<void> {
    if (!this.worker || this.uploaded.get(meshId) !== this.generation) return;
    await this.request({ t: 'releaseMesh', meshId, generation: this.generation });
    this.uploaded.delete(meshId);
  }

  restart(): void {
    this.worker?.removeEventListener('message', this.onMessage); this.worker?.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error('Engine worker restarted'));
    this.pending.clear(); this.worker = undefined; this.ready = undefined; this.uploaded.clear();
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const engineClient = new EngineClient(meshId => binaries.getMesh(meshId));
