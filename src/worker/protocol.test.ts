import { describe, expect, it } from 'vitest';
import { isFromWorker, isToWorker } from './protocol';

const buffer = new ArrayBuffer(4);
const cases: [string, (value: unknown) => boolean, Record<string, unknown>][] = [
  ['init', isToWorker, { t: 'init', prefer: 'st' }],
  ['slice', isToWorker, { t: 'slice', stl: buffer, name: 'cube.stl' }],
  ['ready', isFromWorker, { t: 'ready', variant: 'st', loadPath: 'streaming', loadMs: 1 }],
  ['progress', isFromWorker, { t: 'progress', pct: 50, heapBytes: 1024 }],
  ['done', isFromWorker, { t: 'done', gcode: buffer, sliceMs: 1, peakHeapBytes: 1024 }],
  ['error', isFromWorker, { t: 'error', stage: 'slice', message: 'Failed' }],
];

describe.each(cases)('%s guard', (_, guard, message) => {
  it('accepts the complete shape and additional metadata', () => {
    expect(guard(message)).toBe(true);
    expect(guard({ ...message, extra: true })).toBe(true);
  });
  it.each(Object.keys(message))('rejects missing or invalid %s', key => {
    const incomplete = { ...message };
    delete incomplete[key];
    expect(guard(incomplete)).toBe(false);
    for (const invalid of [null, {}, [], true]) expect(guard({ ...message, [key]: invalid })).toBe(false);
  });
});

it('accepts all enum alternatives, progress boundaries and optional stage', () => {
  expect(isToWorker({ t: 'init', prefer: 'mt' })).toBe(true);
  expect(isFromWorker({ t: 'ready', variant: 'mt', loadPath: 'buffered', loadMs: 0 })).toBe(true);
  for (const stage of ['load', 'probe', 'profile', 'slice', 'export']) expect(isFromWorker({ t: 'error', stage, message: '' })).toBe(true);
  for (const pct of [0, 100]) expect(isFromWorker({ t: 'progress', pct, heapBytes: 0, stage: 'Slicing' })).toBe(true);
});

it('rejects unknown enums, non-finite/negative metrics and wrong buffers', () => {
  for (const [, guard, message] of cases) {
    expect(guard({ ...message, t: 'unknown' })).toBe(false);
    for (const [key, value] of Object.entries(message)) {
      const invalid = typeof value === 'number' ? [-1, NaN, Infinity, '1'] :
        value instanceof ArrayBuffer ? [new Uint8Array(4), 'bytes'] : [];
      for (const replacement of invalid) expect(guard({ ...message, [key]: replacement })).toBe(false);
    }
  }
  for (const patch of [{ pct: 101 }, { stage: null }, { stage: 1 }]) expect(isFromWorker({ t: 'progress', pct: 0, heapBytes: 0, ...patch })).toBe(false);
  expect(isToWorker({ t: 'init', prefer: 'auto' })).toBe(false);
  expect(isFromWorker({ t: 'ready', variant: 'gpu', loadPath: 'streaming', loadMs: 0 })).toBe(false);
  expect(isFromWorker({ t: 'ready', variant: 'st', loadPath: 'cache', loadMs: 0 })).toBe(false);
  expect(isFromWorker({ t: 'error', stage: 'unknown', message: '' })).toBe(false);
  expect(isFromWorker({ t: 'error', stage: { toString: null }, message: '' })).toBe(false);
});

it.each([null, undefined, [], {}, 'init', 0, true])('rejects non-messages: %j', value => {
  expect(isFromWorker(value)).toBe(false);
  expect(isToWorker(value)).toBe(false);
});

const object = { meshId: 'mesh-1', transform: Float32Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1, NaN, NaN]), extruderId: 1 };

it('guards v2 config, mesh and plate operation requests', () => {
  expect(isToWorker({ t: 'config', requestId: 'r1', configHash: 'sha256', nativeJson: '{}' })).toBe(true);
  expect(isToWorker({ t: 'mesh', requestId: 'r2', meshId: 'mesh-1', generation: 2, blob: new Blob(['stl']) })).toBe(true);
  expect(isToWorker({ t: 'releaseMesh', requestId: 'r2b', meshId: 'mesh-1', generation: 2 })).toBe(true);
  expect(isToWorker({ t: 'sliceMulti', requestId: 'r3', configHash: 'sha256', generation: 2, objects: [object] })).toBe(true);
  expect(isToWorker({ t: 'preparePlate', requestId: 'r4', configHash: 'sha256', generation: 2, operation: 3, objects: [object] })).toBe(true);
  expect(isToWorker({ t: 'getStatistics', requestId: 'r5' })).toBe(true);
  expect(isToWorker({ t: 'cancel', requestId: 'r6' })).toBe(true);

  expect(isToWorker({ t: 'sliceMulti', requestId: 'r', configHash: 'h', generation: 0, objects: [] })).toBe(false);
  expect(isToWorker({ t: 'sliceMulti', requestId: 'r', configHash: 'h', generation: 0,
    objects: [{ ...object, transform: new Float32Array(10) }] })).toBe(false);
  expect(isToWorker({ t: 'sliceMulti', requestId: 'r', configHash: 'h', generation: 0,
    objects: [{ ...object, transform: Float32Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1, 0, NaN]) }] })).toBe(false);
  expect(isToWorker({ t: 'preparePlate', requestId: 'r', configHash: 'h', generation: 0, operation: 4, objects: [object] })).toBe(false);
});

it('guards typed v2 result and request-error envelopes', () => {
  const prepared = { scale: [1, 1, 1], rotation: [0, 0, 0], mirror: [1, -1, 1], offset: null };
  expect(isFromWorker({ t: 'accepted', requestId: 'r', kind: 'mesh', generation: 1 })).toBe(true);
  expect(isFromWorker({ t: 'sliceMultiResult', requestId: 'r', gcode: buffer, statistics: {}, sliceMs: 3, peakHeapBytes: 10 })).toBe(true);
  expect(isFromWorker({ t: 'preparePlateResult', requestId: 'r', transforms: [prepared] })).toBe(true);
  expect(isFromWorker({ t: 'statisticsResult', requestId: 'r', statistics: {} })).toBe(true);
  expect(isFromWorker({ t: 'requestError', requestId: 'r', stage: 'prepare', message: 'failed' })).toBe(true);
  expect(isFromWorker({ t: 'preparePlateResult', requestId: 'r', transforms: [{ ...prepared, offset: [0, NaN] }] })).toBe(false);
  expect(isFromWorker({ t: 'requestError', requestId: 'r', stage: 'unknown', message: 'failed' })).toBe(false);
});
