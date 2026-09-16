import { describe, expect, it } from 'vitest';
import { EngineClient, type WorkerLike } from './client';
import type { FromWorker, ToWorker } from '../worker/protocol';

class FakeWorker implements WorkerLike {
  listeners = new Set<EventListenerOrEventListenerObject>();
  messages: ToWorker[] = [];
  released: string[] = [];
  failPrepare = false;
  postMessage(message: ToWorker): void {
    this.messages.push(message);
    queueMicrotask(() => {
      if (message.t === 'init') return this.emit({ t: 'ready', variant: 'st', loadPath: 'streaming', loadMs: 1 });
      if (message.t === 'releaseMesh') this.released.push(message.meshId);
      if (message.t === 'preparePlate') return this.emit(this.failPrepare
        ? { t: 'requestError', requestId: message.requestId, stage: 'prepare', message: 'prepare failed' }
        : { t: 'preparePlateResult', requestId: message.requestId, transforms: message.objects.map((_, index) => ({
          scale: [1, 1, 1], rotation: [0, 0, 0], mirror: [1, 1, 1], offset: [index + 1, index + 2],
        })) });
      if ('requestId' in message) this.emit({ t: 'accepted', requestId: message.requestId,
        kind: message.t as 'config' | 'mesh' | 'releaseMesh' | 'cancel', ...('generation' in message ? { generation: message.generation } : {}) });
    });
  }
  addEventListener(_: string, listener: EventListenerOrEventListenerObject): void { this.listeners.add(listener); }
  removeEventListener(_: string, listener: EventListenerOrEventListenerObject): void { this.listeners.delete(listener); }
  terminate(): void {}
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
