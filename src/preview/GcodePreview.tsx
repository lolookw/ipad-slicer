import { createEffect, on, onCleanup, onMount, type JSX } from 'solid-js';
import { createPreviewAdapter } from './adapter';
import type { ColorModeName, FeatureRoleValue, PreviewBuildVolume } from './adapter';
import type { PreviewSource } from './layer-filter';
import './preview.css';

export type Adapter = Pick<Awaited<ReturnType<typeof createPreviewAdapter>>,
  'setSource' | 'setLayerRange' | 'dispose'
  | 'setColorMode' | 'setHiddenFeatureRoles' | 'setShowTravel' | 'setShowWipe' | 'setShowRetractions' | 'setBuildVolume'
  | 'setView' | 'setCameraMode' | 'frame' | 'getCameraState' | 'setCameraState' | 'capture' | 'getState' | 'onEvent'>;
export type CreateAdapter = (host: HTMLElement, options: Parameters<typeof createPreviewAdapter>[1]) => Promise<Adapter>;

export interface GcodePreviewProps {
  /** What the element should show right now; null keeps it empty. Bytes are copied by the adapter. */
  source: PreviewSource | null;
  /** Bump to force the source to be pushed again (e.g. after a WebGL context restore). */
  reloadKey?: number;
  /** The configured machine's real bed, corner-origin millimeters (see `adapter.ts`'s
   *  `PreviewBuildVolume`) — without it no plate is drawn and the toolpath has nothing to frame it. */
  buildVolume?: PreviewBuildVolume;
  /** Persistent shading/visibility settings (survive a context-lost re-creation, unlike camera pose). */
  colorMode?: ColorModeName;
  hiddenFeatureRoles?: readonly FeatureRoleValue[];
  showTravel?: boolean;
  showWipe?: boolean;
  showRetractions?: boolean;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onError?: (error: unknown) => void;
  /** Mirrors the library's own state snapshot after every event (parse progress/complete/etc). */
  onStateChange?: (state: ReturnType<Adapter['getState']>) => void;
  /** Hands the imperative command surface (camera/capture) up once the adapter exists; undefined on teardown. */
  onReady?: (adapter: Adapter | undefined) => void;
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
  let unsubscribe: (() => void) | undefined;
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
      buildVolume: props.buildVolume,
      colorMode: props.colorMode,
      hiddenFeatureRoles: props.hiddenFeatureRoles,
      showTravel: props.showTravel,
      showWipe: props.showWipe,
      showRetractions: props.showRetractions,
      onContextLost: () => props.onContextLost?.(),
      onContextRestored: () => props.onContextRestored?.(),
    }).then(created => {
      if (disposed) { created.dispose(); return; }
      adapter = created;
      push(props.source, false); // anything that changed while the chunk was loading
      props.onReady?.(created);
      props.onStateChange?.(created.getState());
      unsubscribe = created.onEvent(() => props.onStateChange?.(created.getState()));
    }, error => { if (!disposed) props.onError?.(error); });
  });

  createEffect(on(() => props.source, next => push(next, false), { defer: true }));
  createEffect(on(() => props.reloadKey, () => push(props.source, true), { defer: true }));
  createEffect(on(() => props.buildVolume, volume => { if (volume) adapter?.setBuildVolume(volume); }, { defer: true }));
  createEffect(on(() => props.colorMode, mode => { if (mode !== undefined) adapter?.setColorMode(mode); }, { defer: true }));
  createEffect(on(() => props.hiddenFeatureRoles, roles => adapter?.setHiddenFeatureRoles(roles ?? []), { defer: true }));
  createEffect(on(() => props.showTravel, visible => { if (visible !== undefined) adapter?.setShowTravel(visible); }, { defer: true }));
  createEffect(on(() => props.showWipe, visible => { if (visible !== undefined) adapter?.setShowWipe(visible); }, { defer: true }));
  createEffect(on(() => props.showRetractions, visible => { if (visible !== undefined) adapter?.setShowRetractions(visible); }, { defer: true }));

  onCleanup(() => {
    disposed = true;
    unsubscribe?.();
    props.onReady?.(undefined);
    adapter?.dispose();
    adapter = undefined;
  });

  return <div class="gcode-preview__host" ref={host} />;
}
