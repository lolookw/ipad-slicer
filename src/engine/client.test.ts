import { describe, expect, it, vi } from 'vitest';
import { EngineClient, type WorkerLike } from './client';
import type { FromWorker, ToWorker } from '../worker/protocol';

class FakeWorker implements WorkerLike {
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;
  listeners = new Set<EventListenerOrEventListenerObject>();
  messages: ToWorker[] = [];
  released: string[] = [];
  failPrepare = false;
  failInit = false;
  failSlice = false;
  autoSlice = true;
  terminated = 0;
  variant: 'st' | 'mt' = 'st';
  postMessage(message: ToWorker): void {
    this.messages.push(message);
    queueMicrotask(() => {
      if (message.t === 'init') return this.emit(this.failInit ? { t: 'error', stage: 'load', message: 'load crashed' }
        : { t: 'ready', variant: this.variant, loadPath: 'streaming', loadMs: 1 });
      if (message.t === 'releaseMesh') this.released.push(message.meshId);
      if (message.t === 'preparePlate') return this.emit(this.failPrepare
        ? { t: 'requestError', requestId: message.requestId, stage: 'prepare', message: 'prepare failed' }
        : { t: 'preparePlateResult', requestId: message.requestId, transforms: message.objects.map((_, index) => ({
          scale: [1, 1, 1], rotation: [0, 0, 0], mirror: [1, 1, 1], offset: [index + 1, index + 2],
        })) });
      if (message.t === 'sliceMulti' && this.autoSlice) return this.failSlice
        ? this.emit({ t: 'requestError', requestId: message.requestId, stage: 'slice', message: 'slice rejected' })
        : this.completeSlice(message.requestId);
      if ('requestId' in message) this.emit({ t: 'accepted', requestId: message.requestId,
        kind: message.t as 'config' | 'mesh' | 'releaseMesh' | 'cancel', ...('generation' in message ? { generation: message.generation } : {}) });
    });
  }
  addEventListener(_: string, listener: EventListenerOrEventListenerObject): void { this.listeners.add(listener); }
  removeEventListener(_: string, listener: EventListenerOrEventListenerObject): void { this.listeners.delete(listener); }
  terminate(): void { this.terminated++; }
  completeSlice(requestId: string): void { this.emit({ t: 'sliceMultiResult', requestId, gcode: new ArrayBuffer(1),
    statistics: { schemaVersion: '0.2' }, sliceMs: 2, peakHeapBytes: 3 }); }
  private emit(data: FromWorker): void {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners) typeof listener === 'function' ? listener(event) : listener.handleEvent(event);
  }
}

const transform = Float32Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1, NaN, NaN]);
const objects = [{ meshId: 'a', transform, extruderId: 1 }, { meshId: 'b', transform, extruderId: 1 }];

describe('EngineClient mesh generations', () => {
  it('uploads each mesh once per generation and re-sends it after restart', async () => {
    const workers: FakeWorker[] = [];
    const client = new EngineClient(id => new Blob([id]), () => { const worker = new FakeWorker(); workers.push(worker); return worker; });
    await client.prepare('{}', objects, 3);
    await client.prepare('{}', objects, 3);
    expect(workers[0]!.messages.filter(message => message.t === 'mesh')).toHaveLength(2);
    client.restart();
    await client.prepare('{}', objects, 3);
    expect(workers[1]!.messages.filter(message => message.t === 'mesh')).toHaveLength(2);
    expect((workers[1]!.messages.find(message => message.t === 'mesh') as Extract<ToWorker, { t: 'mesh' }>).generation).toBe(2);
  });

  it('rejects a missing mesh before sending the plate operation', async () => {
    const worker = new FakeWorker();
    const client = new EngineClient(id => id === 'a' ? new Blob(['a']) : undefined, () => worker);
    await expect(client.prepare('{}', objects, 3)).rejects.toThrow('Missing mesh b');
    expect(worker.messages.some(message => message.t === 'preparePlate')).toBe(false);
  });

  it('releases uploaded mesh cache entries and surfaces preparation failure', async () => {
    const worker = new FakeWorker();
    const client = new EngineClient(id => new Blob([id]), () => worker);
    await client.prepare('{}', [objects[0]!], 1);
    await client.releaseMesh('a');
    expect(worker.released).toEqual(['a']);
    worker.failPrepare = true;
    await expect(client.prepare('{}', [objects[0]!], 1)).rejects.toThrow('prepare failed');
    expect(worker.messages.filter(message => message.t === 'mesh')).toHaveLength(2);
  });
});

describe('EngineClient slicing queue', () => {
  it('soft-cancels st without termination and only surfaces the latest queued result', async () => {
    const worker = new FakeWorker(); worker.autoSlice = false;
    const client = new EngineClient(id => new Blob([id]), () => worker);
    const first = client.slice('{"a":1}', [objects[0]!]);
    const firstMessage = await vi.waitUntil(() => worker.messages.find(message => message.t === 'sliceMulti') as Extract<ToWorker, { t: 'sliceMulti' }> | undefined);
    expect(client.cancelSlice()).toEqual({ finishingPreviousSlice: true });
    const second = client.slice('{"a":2}', [objects[0]!]);
    worker.completeSlice(firstMessage.requestId);
    await expect(first).resolves.toBeUndefined();
    const slices = await vi.waitUntil(() => {
      const values = worker.messages.filter((message): message is Extract<ToWorker, { t: 'sliceMulti' }> => message.t === 'sliceMulti');
      return values.length === 2 ? values : undefined;
    });
    expect(slices).toHaveLength(2); expect(worker.terminated).toBe(0);
    worker.completeSlice(slices[1]!.requestId);
    await expect(second).resolves.toMatchObject({ sliceMs: 2, variant: 'st' });
  });

  it('terminates mt cancellation and discards its rejected response', async () => {
    const worker = new FakeWorker(); worker.variant = 'mt'; worker.autoSlice = false;
    const replacement = new FakeWorker(); replacement.variant = 'mt'; const workers = [worker, replacement];
    const client = new EngineClient(id => new Blob([id]), () => workers.shift()!, { preference: 'mt' });
    const pending = client.slice('{}', [objects[0]!]);
    await vi.waitUntil(() => worker.messages.some(message => message.t === 'sliceMulti'));
    expect(client.cancelSlice()).toEqual({ finishingPreviousSlice: false });
    expect(worker.terminated).toBe(1); await expect(pending).resolves.toBeUndefined();
    await vi.waitUntil(() => replacement.messages.some(message => message.t === 'init'));
  });

  it('marks an auto mt load failure and retries with st', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
    const first = new FakeWorker(); first.failInit = true;
    const second = new FakeWorker(); const workers = [first, second];
    const client = new EngineClient(id => new Blob([id]), () => workers.shift()!, { preference: 'auto', buildId: 'build-a', storage });
    await client.prepare('{}', [objects[0]!], 1);
    expect(first.terminated).toBe(1); expect(values.get('ipad-slicer:mt-failed:build-a')).toBe('1');
    expect((second.messages[0] as Extract<ToWorker, { t: 'init' }>).prefer).toBe('st');
  });

  it('marks an mt worker crash but not a typed slice request error', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
    const rejected = new FakeWorker(); rejected.variant = 'mt'; rejected.failSlice = true;
    const rejectedClient = new EngineClient(id => new Blob([id]), () => rejected, { preference: 'mt', buildId: 'build-a', storage });
    await expect(rejectedClient.slice('{}', [objects[0]!])).rejects.toThrow('slice rejected');
    expect(values.size).toBe(0);
    const crashed = new FakeWorker(); crashed.variant = 'mt'; crashed.autoSlice = false;
    const crashedClient = new EngineClient(id => new Blob([id]), () => crashed, { preference: 'mt', buildId: 'build-a', storage });
    const pending = crashedClient.slice('{}', [objects[0]!]);
    await vi.waitUntil(() => crashed.messages.some(message => message.t === 'sliceMulti'));
    crashed.onerror?.call(crashed as unknown as AbstractWorker, { message: 'wasm trap' } as ErrorEvent);
    await expect(pending).rejects.toThrow('wasm trap');
    expect(values.get('ipad-slicer:mt-failed:build-a')).toBe('1');
    expect(values.get('ipad-slicer:crash-marker')).toBe('1');
  });
});
