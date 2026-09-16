import type { Variant } from '../../engine/manifest';
import type { Tier } from '../stores';
import type { TierSignals } from './signals';

export const FULL_MIN_TEXTURE_SIZE = 16_384;
export const FULL_MIN_CORES = 6;
export const TIER_STORAGE_KEY = 'ipad-slicer:tier';

export function resolveTier(value: string | null): Tier {
  return value === 'standard' || value === 'full' || value === 'auto' ? value : 'auto';
}

export interface TierDecision {
  tier: Exclude<Tier, 'auto'>;
  fullEligible: boolean;
  reasons: string[];
  limits: { objects: number; triangles: number; previewMegabytes: number };
}

export function decideTier(preference: Tier, signals: TierSignals): TierDecision {
  const reasons: string[] = [];
  if (!signals.webgl2) reasons.push('WebGL2 unavailable');
  if (signals.maxTextureSize < FULL_MIN_TEXTURE_SIZE) reasons.push('texture limit below 16384');
  if (signals.hardwareConcurrency < FULL_MIN_CORES && !signals.webgpu) reasons.push('fewer than 6 cores and no WebGPU');
  if (signals.crashMarker) reasons.push('suspected previous crash');
  const fullEligible = reasons.length === 0;
  const tier = preference !== 'standard' && fullEligible ? 'full' : 'standard';
  return {
    tier,
    fullEligible,
    reasons,
    limits: tier === 'full'
      ? { objects: 16, triangles: 4_000_000, previewMegabytes: 150 }
      : { objects: 4, triangles: 1_500_000, previewMegabytes: 100 },
  };
}

export function decideThreadVariant(probeVariant: Variant, mtFailed: boolean): { variant: Variant; reason: string } {
  if (probeVariant !== 'mt') return { variant: 'st', reason: 'multithread probe did not pass' };
  if (mtFailed) return { variant: 'st', reason: 'sticky fallback after multithread failure' };
  return { variant: 'mt', reason: 'multithread probe passed' };
}
