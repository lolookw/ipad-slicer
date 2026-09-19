import type { GcodePreviewElement, GcodePreviewSource } from '@chestnutlabs/gcode-preview-element';

export type LayerRange = [number, number] | null;
export type PreviewElement = HTMLElement & Pick<GcodePreviewElement,
  'source' | 'quality' | 'layerRange' | 'adjacentLayers' | 'progressivePreview'>;

export interface PreviewOptions {
  source: GcodePreviewSource;
  layerRange?: LayerRange;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

// Mutable bytes belong to the preview; immutable File instances may be shared.
function ownedSource(source: GcodePreviewSource): GcodePreviewSource {
  return source instanceof Uint8Array || source instanceof ArrayBuffer ? source.slice() : source;
}

async function loadElement(): Promise<PreviewElement> {
  const { defineGcodePreview } = await import('@chestnutlabs/gcode-preview-element');
  defineGcodePreview();
  return document.createElement('gcode-preview') as GcodePreviewElement;
}

/** Property boundary only: 0.20.1 layer ranges clip draws, not GPU allocations. */
export async function createPreviewAdapter(
  host: HTMLElement,
  options: PreviewOptions,
  createElement: () => Promise<PreviewElement> = loadElement,
) {
  const element = await createElement();
  element.quality = 'lines';
  element.adjacentLayers = 0;
  element.progressivePreview = 'off';
  element.layerRange = options.layerRange ? [...options.layerRange] : null;
  element.source = ownedSource(options.source);
  host.append(element);

  // Native context events do not bubble or cross the package's open shadow root.
  const canvas = element.shadowRoot?.querySelector('canvas');
  const lost = (event: Event) => {
    event.preventDefault();
    options.onContextLost?.();
  };
  const restored = () => options.onContextRestored?.();
  canvas?.addEventListener('webglcontextlost', lost);
  canvas?.addEventListener('webglcontextrestored', restored);
  let disposed = false;

  return {
    setLayerRange(range: LayerRange) {
      if (!disposed) element.layerRange = range ? [...range] : null;
    },
    /** Budget rungs shrink the source itself: the library only clips draws, it never frees buffers. */
    setSource(source: GcodePreviewSource, range: LayerRange = null) {
      if (disposed) return;
      element.layerRange = null; // never pair a stale range with a different text
      element.source = ownedSource(source);
      element.layerRange = range ? [...range] : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas?.removeEventListener('webglcontextlost', lost);
      canvas?.removeEventListener('webglcontextrestored', restored);
      // disconnectedCallback owns controller/renderer disposal; no public dispose exists.
      element.remove();
      element.source = null;
    },
  };
}
