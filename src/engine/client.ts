import type { Variant } from './manifest';
import { isFromWorker, type FromWorker, type PlateObjectMessage, type ToWorker } from '../worker/protocol';
import type { EngineTransform } from '../viewer/transforms';
import { binaries } from '../app/stores';
import { hasMtFailure, markMtFailure, preferredVariant, retryMt, type KeyValueStorage, type VariantPreference } from '../slice/crash-marker';

type Pending = { resolve: (message: FromWorker) => void; reject: (reason: Error) => void };
export type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate' | 'onerror'>;
type RequestMessage = Exclude<ToWorker, { t: 'init' | 'slice' }>;
type WithoutRequestId<T> = T extends { requestId: string } ? Omit<T, 'requestId'> : never;
export interface SliceResult { gcode: ArrayBuffer; statistics: unknown; sliceMs: number; peakHeapBytes: number; variant: Variant; loadMs: number }
interface SliceJob { nativeJson: string; objects: readonly PlateObjectMessage[]; stale: boolean; resolve: (value: SliceResult | undefined) => void; reject: (error: Error) => void }
export interface EngineClientOptions { preference?: VariantPreference; buildId?: string; storage?: KeyValueStorage }

export class EngineClient {
  private worker?: WorkerLike;
  private generation = 0;
  private uploaded = new Map<string, number>();
  private pending = new Map<string, Pending>();
  private ready?: Promise<void>;
  private variant?: Variant;
  private loadMs = 0;
  private activeSlice?: SliceJob;
  private queuedSlice?: SliceJob;
  private readonly preference: VariantPreference;
  private readonly buildId: string;
  private readonly storage?: KeyValueStorage;

  constructor(private readonly source: (meshId: string) => Blob | undefined,
    private readonly createWorker: () => WorkerLike = () => new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' }),
    options: EngineClientOptions = {}) {
    this.preference = options.preference ?? 'auto'; this.buildId = options.buildId ?? 'wasm-v2.4.2-patch19';
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  }

  private onMessage = (event: MessageEvent<unknown>) => {
    if (!isFromWorker(event.data)) return;
    if (event.data.t === 'ready') { this.variant = event.data.variant; this.loadMs = event.data.loadMs; return; }
    if ('requestId' in event.data) {
      const pending = this.pending.get(event.data.requestId);
      if (!pending) return;
      this.pending.delete(event.data.requestId);
      if (event.data.t === 'requestError') pending.reject(new Error(event.data.message)); else pending.resolve(event.data);
    }
  };

  private onWorkerError = (event: ErrorEvent) => {
    if (this.variant === 'mt') markMtFailure(this.storage, this.buildId);
    const error = new Error(event.message || 'Engine worker crashed');
    for (const pending of this.pending.values()) pending.reject(error);
    if (this.worker) { this.worker.onerror = null; this.worker.removeEventListener('message', this.onMessage); this.worker.terminate(); }
    this.pending.clear(); this.worker = undefined; this.ready = undefined; this.uploaded.clear(); this.variant = undefined;
  };

  private ensureWorker(): Promise<void> {
    if (this.ready) return this.ready;
    const worker = this.createWorker();
    this.worker = worker; this.generation++; this.uploaded.clear();
    worker.addEventListener('message', this.onMessage);
    const prefer = preferredVariant(this.preference, 'mt', hasMtFailure(this.storage, this.buildId));
    const attempt = new Promise<void>((resolve, reject) => {
      worker.onerror = (event) => { if (prefer === 'mt') markMtFailure(this.storage, this.buildId); reject(new Error(event.message || 'Engine worker crashed while loading')); };
      const ready = (event: MessageEvent<unknown>) => {
        if (!isFromWorker(event.data)) return;
        if (event.data.t === 'ready') { worker.removeEventListener('message', ready); worker.onerror = this.onWorkerError; this.variant = event.data.variant; this.loadMs = event.data.loadMs; resolve(); }
        else if (event.data.t === 'error') { worker.removeEventListener('message', ready); if (prefer === 'mt') markMtFailure(this.storage, this.buildId); reject(new Error(event.data.message)); }
      };
      worker.addEventListener('message', ready);
      worker.postMessage({ t: 'init', prefer } satisfies ToWorker);
    });
    this.ready = attempt.catch(error => {
      if (this.preference === 'auto' && prefer === 'mt') { this.restart(); return this.ensureWorker(); }
      throw error;
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

  async slice(nativeJson: string, objects: readonly PlateObjectMessage[]): Promise<SliceResult | undefined> {
    await this.ensureWorker();
    return new Promise((resolve, reject) => {
      const job: SliceJob = { nativeJson, objects, stale: false, resolve, reject };
      if (this.activeSlice) {
        this.activeSlice.stale = true;
        this.queuedSlice?.resolve(undefined);
        this.queuedSlice = job;
      } else this.startSlice(job);
    });
  }

  private startSlice(job: SliceJob): void {
    this.activeSlice = job;
    void this.runSlice(job).then(value => job.resolve(job.stale ? undefined : value), error => {
      if (job.stale) job.resolve(undefined); else job.reject(error instanceof Error ? error : new Error(String(error)));
    }).finally(() => {
      if (this.activeSlice === job) this.activeSlice = undefined;
      const next = this.queuedSlice; this.queuedSlice = undefined;
      if (next) this.startSlice(next);
    });
  }

  private async runSlice(job: SliceJob): Promise<SliceResult> {
    const configHash = await sha256(job.nativeJson);
    await this.request({ t: 'config', configHash, nativeJson: job.nativeJson });
    await this.upload(job.objects);
    const response = await this.request({ t: 'sliceMulti', configHash, generation: this.generation, objects: [...job.objects] });
    if (response.t !== 'sliceMultiResult' || !this.variant) throw new Error('Invalid slice result');
    return { ...response, variant: this.variant, loadMs: this.loadMs };
  }

  cancelSlice(): { finishingPreviousSlice: boolean } {
    if (!this.activeSlice) return { finishingPreviousSlice: false };
    this.activeSlice.stale = true; this.queuedSlice?.resolve(undefined); this.queuedSlice = undefined;
    const finishingPreviousSlice = this.variant === 'st';
    if (this.variant === 'mt') { this.restart(); void this.ensureWorker().catch(() => undefined); }
    return { finishingPreviousSlice };
  }

  retryMultithread(): void { retryMt(this.storage, this.buildId); }

  async releaseMesh(meshId: string): Promise<void> {
    if (!this.worker || this.uploaded.get(meshId) !== this.generation) return;
    await this.request({ t: 'releaseMesh', meshId, generation: this.generation });
    this.uploaded.delete(meshId);
  }

  restart(): void {
    if (this.worker) { this.worker.onerror = null; this.worker.removeEventListener('message', this.onMessage); this.worker.terminate(); }
    for (const pending of this.pending.values()) pending.reject(new Error('Engine worker restarted'));
    this.pending.clear(); this.worker = undefined; this.ready = undefined; this.uploaded.clear(); this.variant = undefined; this.loadMs = 0;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const engineClient = new EngineClient(meshId => binaries.getMesh(meshId));
