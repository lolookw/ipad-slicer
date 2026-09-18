import type { TierDecision } from '../app/tier/decide';

const BYTES_PER_LINE = 30;
const BYTES_PER_SEGMENT = 48;
const MAX_DECIMATION_STRIDE = 16;
// Decimal MB, matching the tier policy. Full remains provisional until device calibration.
export const PREVIEW_BUDGET_BYTES = { standard: 100_000_000, full: 150_000_000 } as const;
const STAGES = ['all-visible', 'window', 'decimated', 'unavailable'] as const;
export type PreviewStage = typeof STAGES[number];

export interface PreviewBudgetInput {
  gcodeBytes: number;
  tier: TierDecision['tier'];
  totalLayers: number;
  currentLayer: number;
  windowRadius?: number;
  minimumStage?: PreviewStage;
}

export interface PreviewPlan {
  stage: PreviewStage;
  layerRange: [number, number] | null;
  decimationStride: number;
  estimatedGpuBytes: number;
  budgetBytes: number;
}

export function estimateLineCount(bytes: number): number {
  return Number.isFinite(bytes) && bytes >= 0 ? Math.ceil(bytes / BYTES_PER_LINE) : Infinity;
}

export function estimateGpuBytes(segments: number): number {
  return Number.isFinite(segments) && segments >= 0 ? Math.ceil(segments) * BYTES_PER_SEGMENT : Infinity;
}

export function nextPreviewStage(stage: PreviewStage): PreviewStage {
  return STAGES[Math.min(STAGES.indexOf(stage) + 1, STAGES.length - 1)] ?? 'unavailable';
}

/** Preview-only policy: never modifies the result, estimates, or Save availability.
 * Window estimates assume uniform segment density; they are not measured allocations.
 * Callers must actually filter/decimate geometry before treating this as a GPU limit.
 */
export function planPreview(input: PreviewBudgetInput): PreviewPlan {
  const budgetBytes = PREVIEW_BUDGET_BYTES[input.tier];
  const unavailable: PreviewPlan = { stage: 'unavailable', layerRange: null,
    decimationStride: 0, estimatedGpuBytes: 0, budgetBytes };
  const radius = input.windowRadius ?? 2;
  const segments = estimateLineCount(input.gcodeBytes);
  if (!Number.isFinite(segments) || !Number.isInteger(input.totalLayers) || input.totalLayers <= 0
    || !Number.isFinite(input.currentLayer) || !Number.isFinite(radius) || radius < 0) return unavailable;

  const minimum = Math.max(input.tier === 'standard' ? 1 : 0, STAGES.indexOf(input.minimumStage ?? 'all-visible'));
  const allBytes = estimateGpuBytes(segments);
  if (minimum === 0 && allBytes <= budgetBytes) {
    return { stage: 'all-visible', layerRange: null, decimationStride: 1, estimatedGpuBytes: allBytes, budgetBytes };
  }

  const current = Math.max(0, Math.min(input.totalLayers - 1, Math.floor(input.currentLayer)));
  const layerRange: [number, number] = [Math.max(0, current - Math.floor(radius)),
    Math.min(input.totalLayers - 1, current + Math.floor(radius))];
  const windowSegments = Math.ceil(segments * ((layerRange[1] - layerRange[0] + 1) / input.totalLayers));
  const windowBytes = estimateGpuBytes(windowSegments);
  if (minimum <= 1 && windowBytes <= budgetBytes) {
    return { stage: 'window', layerRange, decimationStride: 1, estimatedGpuBytes: windowBytes, budgetBytes };
  }

  const decimationStride = Math.max(2, Math.ceil(windowSegments / Math.floor(budgetBytes / BYTES_PER_SEGMENT)));
  if (minimum <= 2 && decimationStride <= MAX_DECIMATION_STRIDE) {
    return { stage: 'decimated', layerRange, decimationStride,
      estimatedGpuBytes: estimateGpuBytes(Math.ceil(windowSegments / decimationStride)), budgetBytes };
  }
  return unavailable;
}
