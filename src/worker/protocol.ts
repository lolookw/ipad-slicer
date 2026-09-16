import type { Variant } from '../engine/manifest';
import type { EngineTransform } from '../viewer/transforms';

export interface PlateObjectMessage { meshId: string; transform: Float32Array; extruderId: number }

export type ToWorker =
  | { t: 'init'; prefer: Variant }
  | { t: 'slice'; stl: ArrayBuffer; name: string }
  | { t: 'config'; requestId: string; configHash: string; nativeJson: string }
  | { t: 'mesh'; requestId: string; meshId: string; generation: number; blob: Blob }
  | { t: 'sliceMulti'; requestId: string; configHash: string; generation: number; objects: PlateObjectMessage[] }
  | { t: 'preparePlate'; requestId: string; configHash: string; generation: number; operation: 1 | 2 | 3; objects: PlateObjectMessage[] }
  | { t: 'getStatistics'; requestId: string }
  | { t: 'cancel'; requestId: string };

export type RequestStage = 'config' | 'mesh' | 'slice' | 'prepare' | 'statistics' | 'cancel';
export type FromWorker =
  | { t: 'ready'; variant: Variant; loadPath: 'streaming' | 'buffered'; loadMs: number; probe?: string }
  | { t: 'progress'; pct: number; heapBytes: number; stage?: string }
  | { t: 'done'; gcode: ArrayBuffer; sliceMs: number; peakHeapBytes: number }
  | { t: 'error'; stage: 'load' | 'probe' | 'profile' | 'slice' | 'export'; message: string }
  | { t: 'accepted'; requestId: string; kind: 'config' | 'mesh' | 'cancel'; generation?: number }
  | { t: 'sliceMultiResult'; requestId: string; gcode: ArrayBuffer; statistics: unknown; sliceMs: number; peakHeapBytes: number }
  | { t: 'preparePlateResult'; requestId: string; transforms: EngineTransform[] }
  | { t: 'statisticsResult'; requestId: string; statistics: unknown }
  | { t: 'requestError'; requestId: string; stage: RequestStage; message: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => nonnegative(value) && Number.isInteger(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const variant = (value: unknown): value is Variant => value === 'st' || value === 'mt';
const stage = (value: unknown): value is RequestStage =>
  typeof value === 'string' && ['config', 'mesh', 'slice', 'prepare', 'statistics', 'cancel'].includes(value);

function transform(value: unknown): value is Float32Array {
  if (!(value instanceof Float32Array) || value.length !== 11 || !value.slice(0, 9).every(Number.isFinite)) return false;
  return value.slice(9).every(Number.isFinite) || value.slice(9).every(Number.isNaN);
}

function object(value: unknown): value is PlateObjectMessage {
  return record(value) && text(value.meshId) && transform(value.transform) && integer(value.extruderId) && value.extruderId > 0;
}

function engineTransform(value: unknown): value is EngineTransform {
  if (!record(value) || !Array.isArray(value.scale) || value.scale.length !== 3 || !value.scale.every(Number.isFinite) ||
    !Array.isArray(value.rotation) || value.rotation.length !== 3 || !value.rotation.every(Number.isFinite) ||
    !Array.isArray(value.mirror) || value.mirror.length !== 3 || !value.mirror.every(item => item === 1 || item === -1)) return false;
  return value.offset === null || (Array.isArray(value.offset) && value.offset.length === 2 && value.offset.every(Number.isFinite));
}

export function isToWorker(value: unknown): value is ToWorker {
  if (!record(value)) return false;
  if (value.t === 'init') return variant(value.prefer);
  if (value.t === 'slice') return value.stl instanceof ArrayBuffer && typeof value.name === 'string';
  if (!text(value.requestId)) return false;
  switch (value.t) {
    case 'config': return text(value.configHash) && typeof value.nativeJson === 'string';
    case 'mesh': return text(value.meshId) && integer(value.generation) && value.blob instanceof Blob;
    case 'sliceMulti': return text(value.configHash) && integer(value.generation) && Array.isArray(value.objects) && value.objects.length > 0 && value.objects.every(object);
    case 'preparePlate': return text(value.configHash) && integer(value.generation) && (value.operation === 1 || value.operation === 2 || value.operation === 3) && Array.isArray(value.objects) && value.objects.length > 0 && value.objects.every(object);
    case 'getStatistics':
    case 'cancel': return true;
    default: return false;
  }
}

export function isFromWorker(value: unknown): value is FromWorker {
  if (!record(value)) return false;
  switch (value.t) {
    case 'ready': return variant(value.variant) && nonnegative(value.loadMs) && (value.loadPath === 'streaming' || value.loadPath === 'buffered');
    case 'progress': return nonnegative(value.pct) && value.pct <= 100 && nonnegative(value.heapBytes) && (value.stage === undefined || typeof value.stage === 'string');
    case 'done': return value.gcode instanceof ArrayBuffer && nonnegative(value.sliceMs) && nonnegative(value.peakHeapBytes);
    case 'error': return typeof value.stage === 'string' && ['load', 'probe', 'profile', 'slice', 'export'].includes(value.stage) && typeof value.message === 'string';
    case 'accepted': return text(value.requestId) && (value.kind === 'config' || value.kind === 'mesh' || value.kind === 'cancel') && (value.generation === undefined || integer(value.generation));
    case 'sliceMultiResult': return text(value.requestId) && value.gcode instanceof ArrayBuffer && nonnegative(value.sliceMs) && nonnegative(value.peakHeapBytes);
    case 'preparePlateResult': return text(value.requestId) && Array.isArray(value.transforms) && value.transforms.every(engineTransform);
    case 'statisticsResult': return text(value.requestId);
    case 'requestError': return text(value.requestId) && stage(value.stage) && typeof value.message === 'string';
    default: return false;
  }
}
