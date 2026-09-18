import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreviewAdapter, type PreviewElement } from './adapter';

function fixture() {
  const host = document.createElement('div');
  document.body.append(host);
  const element: PreviewElement = Object.assign(document.createElement('div'), {
    source: null, quality: null, layerRange: null, adjacentLayers: null, progressivePreview: null,
  });
  const canvas = document.createElement('canvas');
  element.attachShadow({ mode: 'open' }).append(canvas);
  return { host, element, canvas, factory: vi.fn(async () => element) };
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
});
