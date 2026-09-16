import type { Variant } from '../engine/manifest';
import { decideThreadVariant } from '../app/tier/decide';
import { CRASH_MARKER_STORAGE_KEY } from '../app/tier/signals';

export type VariantPreference = 'auto' | Variant;
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export const mtFailureKey = (buildId: string) => `ipad-slicer:mt-failed:${buildId}`;
export const hasMtFailure = (storage: KeyValueStorage | undefined, buildId: string) => storage?.getItem(mtFailureKey(buildId)) === '1';
export function markMtFailure(storage: KeyValueStorage | undefined, buildId: string): void {
  storage?.setItem(mtFailureKey(buildId), '1');
  storage?.setItem(CRASH_MARKER_STORAGE_KEY, '1');
}
export function retryMt(storage: KeyValueStorage | undefined, buildId: string): void {
  storage?.removeItem(mtFailureKey(buildId));
  storage?.removeItem(CRASH_MARKER_STORAGE_KEY);
}

export function preferredVariant(preference: VariantPreference, probeVariant: Variant, failed: boolean): Variant {
  if (preference === 'st') return 'st';
  return decideThreadVariant(probeVariant, preference === 'auto' && failed).variant;
}
