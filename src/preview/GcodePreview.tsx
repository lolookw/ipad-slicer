import { createEffect, on, onCleanup, onMount, type JSX } from 'solid-js';
import { createPreviewAdapter } from './adapter';
import type { PreviewSource } from './layer-filter';
import './preview.css';

type Adapter = Pick<Awaited<ReturnType<typeof createPreviewAdapter>>, 'setSource' | 'setLayerRange' | 'dispose'>;
export type CreateAdapter = (host: HTMLElement, options: Parameters<typeof createPreviewAdapter>[1]) => Promise<Adapter>;

export interface GcodePreviewProps {
  /** What the element should show right now; null keeps it empty. Bytes are copied by the adapter. */
  source: PreviewSource | null;
  /** Bump to force the source to be pushed again (e.g. after a WebGL context restore). */
  reloadKey?: number;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onError?: (error: unknown) => void;
  /** Test seam; defaults to the lazy library-backed adapter. */
  createAdapter?: CreateAdapter;
}

/**
 * Owns the `<gcode-preview>` element's lifecycle. The element is created through the adapter in
 * onMount (the library chunk is dynamically imported there), fed with properties only, and
 * disposed in onCleanup. Nothing outside preview/adapter.ts knows about the library.
 */
export function GcodePreview(props: GcodePreviewProps): JSX.Element {
  let host!: HTMLDivElement;
  let adapter: Adapter | undefined;
  let disposed = false;
  let applied: PreviewSource | null = null;
  const initial = props.source;
  applied = initial;

  const push = (next: PreviewSource | null, force: boolean) => {
    if (!adapter || !next) return;
    if (!force && applied && applied.bytes === next.bytes) adapter.setLayerRange(next.layerRange);
    else adapter.setSource(next.bytes, next.layerRange);
    applied = next;
  };

  onMount(() => {
    const create = props.createAdapter ?? createPreviewAdapter;
    create(host, {
      source: initial?.bytes ?? null,
      layerRange: initial?.layerRange ?? null,
      onContextLost: () => props.onContextLost?.(),
      onContextRestored: () => props.onContextRestored?.(),
    }).then(created => {
      if (disposed) { created.dispose(); return; }
      adapter = created;
      push(props.source, false); // anything that changed while the chunk was loading
    }, error => { if (!disposed) props.onError?.(error); });
  });

  createEffect(on(() => props.source, next => push(next, false), { defer: true }));
  createEffect(on(() => props.reloadKey, () => push(props.source, true), { defer: true }));

  onCleanup(() => { disposed = true; adapter?.dispose(); adapter = undefined; });

  return <div class="gcode-preview__host" ref={host} />;
}
