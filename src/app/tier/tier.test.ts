import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { decideThreadVariant, decideTier } from './decide';
import { collectTierSignals, type TierSignals } from './signals';

const capable: TierSignals = {
  webgl2: true, maxTextureSize: 16384, hardwareConcurrency: 6, webgpu: false,
  coarsePointer: true, viewportWidth: 1024, crashMarker: false,
};

describe('adaptive tier decision', () => {
  it.each([
    ['auto', capable, 'full'],
    ['standard', capable, 'standard'],
    ['full', { ...capable, hardwareConcurrency: 4 }, 'standard'],
    ['full', { ...capable, hardwareConcurrency: 4, webgpu: true }, 'full'],
    ['auto', { ...capable, crashMarker: true }, 'standard'],
    ['auto', { ...capable, webgl2: false }, 'standard'],
    ['auto', { ...capable, maxTextureSize: 8192 }, 'standard'],
  ] as const)('%s resolves to %s', (preference, signals, expected) => {
    expect(decideTier(preference, signals).tier).toBe(expected);
  });

  it('collects rendering, input and viewport signals without retaining the probe context', () => {
    const loseContext = vi.fn();
    const gl = {
      MAX_TEXTURE_SIZE: 3379,
      getParameter: () => 16384,
      getExtension: () => ({ loseContext }),
    } as unknown as WebGL2RenderingContext;
    const signals = collectTierSignals({
      createCanvas: () => ({ getContext: () => gl }) as unknown as HTMLCanvasElement,
      hardwareConcurrency: 8,
      webgpu: true,
      coarsePointer: true,
      viewportWidth: 834,
      crashMarker: false,
    });
    expect(signals).toMatchObject({ webgl2: true, maxTextureSize: 16384, hardwareConcurrency: 8, webgpu: true });
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('keeps thread selection independent and probe gated', () => {
    expect(decideThreadVariant('mt', false).variant).toBe('mt');
    expect(decideThreadVariant('mt', true).variant).toBe('st');
    expect(decideThreadVariant('st', false).variant).toBe('st');
  });
});
