import type { Variant } from '../engine/manifest';

export type ToWorker = { t: 'init'; prefer: Variant } | { t: 'slice'; stl: ArrayBuffer; name: string };
export type FromWorker =
  | { t: 'ready'; variant: Variant; loadPath: 'streaming' | 'buffered'; loadMs: number }
  | { t: 'progress'; pct: number; heapBytes: number; stage?: string }
  | { t: 'done'; gcode: ArrayBuffer; sliceMs: number; peakHeapBytes: number }
  | { t: 'error'; stage: 'load' | 'probe' | 'profile' | 'slice' | 'export'; message: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const variant = (value: unknown): value is Variant => value === 'st' || value === 'mt';

export function isToWorker(value: unknown): value is ToWorker {
  if (!record(value)) return false;
  switch (value.t) {
    case 'init': return variant(value.prefer);
    case 'slice': return value.stl instanceof ArrayBuffer && typeof value.name === 'string';
    default: return false;
  }
}

export function isFromWorker(value: unknown): value is FromWorker {
  if (!record(value)) return false;
  switch (value.t) {
    case 'ready': return variant(value.variant) && nonnegative(value.loadMs) &&
      (value.loadPath === 'streaming' || value.loadPath === 'buffered');
    case 'progress': return nonnegative(value.pct) && value.pct <= 100 && nonnegative(value.heapBytes) &&
      (value.stage === undefined || typeof value.stage === 'string');
    case 'done': return value.gcode instanceof ArrayBuffer && nonnegative(value.sliceMs) && nonnegative(value.peakHeapBytes);
    case 'error': return typeof value.stage === 'string' &&
      ['load', 'probe', 'profile', 'slice', 'export'].includes(value.stage) && typeof value.message === 'string';
    default: return false;
  }
}
