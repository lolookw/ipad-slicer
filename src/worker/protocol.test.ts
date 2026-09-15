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
