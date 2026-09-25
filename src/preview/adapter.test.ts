import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildColorMode, createPreviewAdapter, DECLUTTER_ROLES, FEATURE_LEGEND, hslToRgb, proceduralPalette, rgbToCss,
  type PreviewElement, type PreviewState,
} from './adapter';
import { indexGcodeLayers, previewSourceFor } from './layer-filter';
import { planPreview } from './budget';

function fixture() {
  const host = document.createElement('div');
  document.body.append(host);
  const state: PreviewState = {
    parsing: false, parseProgress: null, summary: null, metadata: undefined, activeQuality: null,
    presentation: 'lines' as never, layerCount: 0, segmentCount: 0, disclosure: '', totalTimeMs: null,
    timeEstimateSource: null, availableColorModes: ['single', 'tool', 'moveKind'], hasRetractions: false,
    hasColorChanges: false, error: null,
  };
  const controls = { frame: vi.fn(), setView: vi.fn(), setCameraMode: vi.fn(), getCameraState: vi.fn(() => null), setCameraState: vi.fn() };
  const element: PreviewElement = Object.assign(document.createElement('div'), {
    source: null, quality: null, layerRange: null, adjacentLayers: null, progressivePreview: null,
    colorMode: undefined, hiddenFeatureRoles: [], showTravel: true, showWipe: true, showRetractions: false,
    view: null, cameraMode: null, cameraState: null,
    state,
    controls: controls as unknown as PreviewElement['controls'],
    capture: vi.fn(async () => new Blob()),
    onEvent: vi.fn(() => () => undefined),
  });
  const canvas = document.createElement('canvas');
  element.attachShadow({ mode: 'open' }).append(canvas);
  return { host, element, canvas, controls, factory: vi.fn(async () => element) };
}

afterEach(() => document.body.replaceChildren());

describe('preview adapter', () => {
  it('sets lines-only properties before mounting and copies the saved bytes', async () => {
    const { host, element, factory } = fixture();
    const source = new Uint8Array([1, 2, 3]);
    const adapter = await createPreviewAdapter(host, { source, layerRange: [1, 3] }, factory);
    expect(factory).toHaveBeenCalledOnce();
    expect(element.parentElement).toBe(host);
    expect(element.quality).toBe('lines');
    expect(element.layerRange).toEqual([1, 3]);
    expect(element.adjacentLayers).toBe(0);
    expect(element.progressivePreview).toBe('off');
    expect(element.source).not.toBe(source);
    expect(element.source).toEqual(source);
    (element.source as Uint8Array)[0] = 99;
    adapter.setLayerRange([8, 10]);
    expect(element.layerRange).toEqual([8, 10]);
    expect(source).toEqual(new Uint8Array([1, 2, 3]));
    expect(element.hasAttribute('source')).toBe(false);
    adapter.dispose();
  });

  it('accepts a copied ArrayBuffer and clears the layer range', async () => {
    const { host, element, factory } = fixture();
    const source = new Uint8Array([7, 8]).buffer;
    const adapter = await createPreviewAdapter(host, { source }, factory);
    expect(element.source).not.toBe(source);
    expect(new Uint8Array(element.source as ArrayBuffer)).toEqual(new Uint8Array([7, 8]));
    adapter.setLayerRange(null);
    expect(element.layerRange).toBeNull();
    adapter.dispose();
  });

  it('handles non-bubbling canvas context events and removes listeners on double disposal', async () => {
    const { host, element, canvas, factory } = fixture();
    const onContextLost = vi.fn();
    const onContextRestored = vi.fn();
    const adapter = await createPreviewAdapter(host, { source: null, onContextLost, onContextRestored }, factory);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(lost.defaultPrevented).toBe(true);
    expect(onContextLost).toHaveBeenCalledOnce();
    expect(onContextRestored).toHaveBeenCalledOnce();
    adapter.dispose();
    adapter.dispose();
    adapter.setLayerRange([2, 4]);
    expect(element.isConnected).toBe(false);
    expect(element.source).toBeNull();
    expect(element.layerRange).toBeNull();
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onContextLost).toHaveBeenCalledOnce();
    expect(onContextRestored).toHaveBeenCalledOnce();
  });

  it('re-assigns a smaller source (and range) when the budget rung drops, without touching the caller bytes', async () => {
    const { host, element, factory } = fixture();
    const text = Array.from({ length: 300 }, (_, n) => `;LAYER_CHANGE\n;Z:${(n + 1) * 0.2}\nG1 X${n} Y1 E1\n`).join('');
    const bytes = new TextEncoder().encode(text);
    const index = indexGcodeLayers(bytes);
    const at = (stage: 'all-visible' | 'window' | 'decimated', current: number) => {
      const plan = planPreview({ gcodeBytes: bytes.byteLength, tier: 'full', totalLayers: index.layerCount, currentLayer: current,
        minimumStage: stage });
      expect(plan.stage).toBe(stage);
      return previewSourceFor(bytes, index, plan, current)!;
    };
    const first = at('all-visible', 100);
    const adapter = await createPreviewAdapter(host, { source: first.bytes, layerRange: first.layerRange }, factory);
    const sizes = [(element.source as Uint8Array).byteLength];
    for (const stage of ['window', 'decimated'] as const) {
      const next = at(stage, 100);
      adapter.setSource(next.bytes, next.layerRange);
      sizes.push((element.source as Uint8Array).byteLength);
      expect(element.layerRange).toBeNull();
    }
    expect(sizes[1]!).toBeLessThan(sizes[0]! / 10);
    expect(sizes[2]!).toBeLessThan(sizes[1]!);
    expect(bytes.byteLength).toBe(sizes[0]);
    adapter.dispose();
    adapter.setSource(bytes, null);
    expect(element.source).toBeNull();
  });

  it('applies an initial color mode, hidden feature roles and move-kind toggles before mounting', async () => {
    const { host, element, factory } = fixture();
    const adapter = await createPreviewAdapter(host, {
      source: null, colorMode: 'feature', hiddenFeatureRoles: [6, 7], showTravel: false, showWipe: false, showRetractions: true,
    }, factory);
    expect(element.colorMode).toEqual({ mode: 'feature', palette: expect.any(Array), fallback: expect.any(Array) });
    expect(element.hiddenFeatureRoles).toEqual([6, 7]);
    expect(element.showTravel).toBe(false);
    expect(element.showWipe).toBe(false);
    expect(element.showRetractions).toBe(true);
    adapter.dispose();
  });

  it('switches color mode by capability name, building the full library ColorMode itself', async () => {
    const { host, element, factory } = fixture();
    const adapter = await createPreviewAdapter(host, { source: null }, factory);
    adapter.setColorMode('feedrate');
    expect(element.colorMode).toMatchObject({ mode: 'feedrate' });
    adapter.setColorMode('single');
    expect(element.colorMode).toMatchObject({ mode: 'single' });
    adapter.dispose();
    adapter.setColorMode('object'); // no-op after dispose
    expect(element.colorMode).toMatchObject({ mode: 'single' });
  });

  it('sets hidden feature roles declaratively and the travel/wipe/retraction toggles', async () => {
    const { host, element, factory } = fixture();
    const adapter = await createPreviewAdapter(host, { source: null }, factory);
    adapter.setHiddenFeatureRoles([6, 7, 5]);
    expect(element.hiddenFeatureRoles).toEqual([6, 7, 5]);
    adapter.setHiddenFeatureRoles([]);
    expect(element.hiddenFeatureRoles).toEqual([]);
    adapter.setShowTravel(false);
    adapter.setShowWipe(false);
    adapter.setShowRetractions(true);
    expect(element.showTravel).toBe(false);
    expect(element.showWipe).toBe(false);
    expect(element.showRetractions).toBe(true);
    adapter.dispose();
  });

  it('forwards view/camera commands and capture, and reads state', async () => {
    const { host, element, controls, factory } = fixture();
    const adapter = await createPreviewAdapter(host, { source: null }, factory);
    adapter.setView('top');
    expect(element.view).toBe('top');
    adapter.setCameraMode('orthographic');
    expect(element.cameraMode).toBe('orthographic');
    adapter.frame();
    expect(controls.frame).toHaveBeenCalledOnce();
    expect(adapter.getCameraState()).toBeNull();
    const camState = { position: [1, 2, 3] } as never;
    adapter.setCameraState(camState);
    expect(element.cameraState).toBe(camState);
    const blob = await adapter.capture({ format: 'image/png' });
    expect(blob).toBeInstanceOf(Blob);
    expect(adapter.getState()).toBe(element.state);
    const unsubscribe = vi.fn();
    (element.onEvent as ReturnType<typeof vi.fn>).mockReturnValue(unsubscribe);
    const cb = vi.fn();
    const off = adapter.onEvent(cb);
    expect(element.onEvent).toHaveBeenCalledWith(cb);
    off();
    expect(unsubscribe).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(adapter.getCameraState()).toBeNull();
  });
});

describe('color mode / palette pure helpers', () => {
  it('builds every capability name into a full library ColorMode', () => {
    for (const name of ['single', 'feature', 'feedrate', 'layerHeight', 'object', 'tool', 'filament', 'colorChange', 'moveKind', 'power'] as const) {
      const mode = buildColorMode(name);
      expect(mode.mode).toBe(name);
    }
  });

  it('builds a feature palette covering every legend role at its own index', () => {
    const mode = buildColorMode('feature');
    expect(mode.mode).toBe('feature');
    if (mode.mode !== 'feature') throw new Error('unreachable');
    for (const entry of FEATURE_LEGEND) expect(mode.palette[entry.role]).toEqual(entry.color);
    expect(mode.palette[0]).toEqual(mode.fallback); // Unknown (0) has no dedicated color
  });

  it('reuses the legend colors/labels for the declutter row (Skirt/Brim/Support)', () => {
    expect(DECLUTTER_ROLES.map(entry => entry.key).sort()).toEqual(['brim', 'skirt', 'support']);
    for (const entry of DECLUTTER_ROLES) expect(FEATURE_LEGEND).toContainEqual(entry);
  });

  it('produces distinct, in-range procedural colors for any palette size', () => {
    const palette = proceduralPalette(8);
    expect(palette).toHaveLength(8);
    for (const [r, g, b] of palette) for (const c of [r, g, b]) expect(c).toBeGreaterThanOrEqual(0);
    const unique = new Set(palette.map(rgbToCss));
    expect(unique.size).toBe(8);
    expect(proceduralPalette(0)).toHaveLength(1); // never an empty palette
  });

  it('hslToRgb stays within [0,1] and matches known primaries', () => {
    expect(hslToRgb(0, 1, 0.5).map(v => Math.round(v))).toEqual([1, 0, 0]);
    expect(hslToRgb(120, 1, 0.5).map(v => Math.round(v))).toEqual([0, 1, 0]);
    expect(hslToRgb(240, 1, 0.5).map(v => Math.round(v))).toEqual([0, 0, 1]);
  });

  it('rgbToCss clamps and rounds to byte values', () => {
    expect(rgbToCss([0, 0.5, 1])).toBe('rgb(0, 128, 255)');
    expect(rgbToCss([-1, 2, 0.999999])).toBe('rgb(0, 255, 255)');
  });
});
