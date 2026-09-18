import { describe, expect, it } from 'vitest';
import { estimateGpuBytes, estimateLineCount, nextPreviewStage, planPreview } from './budget';

const base = { gcodeBytes: 30_000_000, tier: 'full' as const, totalLayers: 100, currentLayer: 50 };

describe('preview budget policy', () => {
  it.each([[0, 0], [30, 1], [31, 2], [300, 10]])('estimates %i bytes as %i lines', (bytes, lines) => {
    expect(estimateLineCount(bytes)).toBe(lines);
    expect(estimateGpuBytes(lines)).toBe(lines * 48);
  });

  it('keeps Full all-visible below its provisional 150 MB cap', () => {
    expect(planPreview(base)).toMatchObject({ stage: 'all-visible', layerRange: null,
      estimatedGpuBytes: 48_000_000, budgetBytes: 150_000_000, decimationStride: 1 });
    expect(planPreview({ ...base, gcodeBytes: 93_750_000 }).stage).toBe('all-visible');
    expect(planPreview({ ...base, gcodeBytes: 93_750_030 }).stage).toBe('window');
  });

  it('defaults Standard to a bounded layer window and 100 MB', () => {
    expect(planPreview({ ...base, tier: 'standard' })).toMatchObject({ stage: 'window',
      layerRange: [48, 52], estimatedGpuBytes: 2_400_000, budgetBytes: 100_000_000 });
    expect(planPreview({ ...base, currentLayer: 0, minimumStage: 'window' }).layerRange).toEqual([0, 2]);
    expect(planPreview({ ...base, currentLayer: 200, minimumStage: 'window' }).layerRange).toEqual([97, 99]);
  });

  it('decimates a window only within the bounded stride limit', () => {
    expect(planPreview({ ...base, gcodeBytes: 3_000_000_000 })).toMatchObject({
      stage: 'decimated', layerRange: [48, 52], decimationStride: 2, estimatedGpuBytes: 120_000_000,
    });
    expect(planPreview({ ...base, gcodeBytes: 300_000_000_000 }).stage).toBe('unavailable');
  });

  it('drops exactly one rung per context loss and never wraps unavailable', () => {
    expect(nextPreviewStage('all-visible')).toBe('window');
    expect(nextPreviewStage('window')).toBe('decimated');
    expect(nextPreviewStage('decimated')).toBe('unavailable');
    expect(nextPreviewStage('unavailable')).toBe('unavailable');
    const lost = planPreview({ ...base, minimumStage: nextPreviewStage('window') });
    expect(lost).toMatchObject({ stage: 'decimated', decimationStride: 2 });
    expect(planPreview({ ...base, minimumStage: 'unavailable' }).stage).toBe('unavailable');
  });

  it.each([NaN, Infinity, -1])('fails closed for invalid byte count %s', (gcodeBytes) => {
    expect(estimateLineCount(gcodeBytes)).toBe(Infinity);
    expect(estimateGpuBytes(gcodeBytes)).toBe(Infinity);
    expect(planPreview({ ...base, gcodeBytes }).stage).toBe('unavailable');
  });

  it('fails closed for absent layers and does not own Save bytes or estimates', () => {
    const result = Object.freeze({ bytes: new Uint8Array([1, 2]), estimates: { seconds: 42 } });
    expect(planPreview({ ...base, totalLayers: 0 })).toMatchObject({ stage: 'unavailable', estimatedGpuBytes: 0 });
    expect(planPreview({ ...base, currentLayer: NaN }).stage).toBe('unavailable');
    expect(planPreview({ ...base, gcodeBytes: result.bytes.byteLength, minimumStage: 'unavailable' }).stage).toBe('unavailable');
    expect(result.bytes).toEqual(new Uint8Array([1, 2]));
    expect(result.estimates.seconds).toBe(42);
  });
});
