import { createEffect, createMemo, createSignal, lazy, on, Show, Suspense, type JSX } from 'solid-js';
import type { TierDecision } from '../app/tier/decide';
import { planPreview, nextPreviewStage, type PreviewStage } from './budget';
import type { CreateAdapter } from './GcodePreview';
import { webglAvailable } from './webgl';
import { indexGcodeLayers, previewSourceFor } from './layer-filter';
import { LayerSlider, type LayerSliderLabels } from './LayerSlider';
import './preview.css';

// The library-backed adapter and the element live in their own chunk.
const GcodePreview = lazy(() => import('./GcodePreview').then(module => ({ default: module.GcodePreview })));

export interface PreviewLabels extends Omit<LayerSliderLabels, 'previous' | 'next' | 'slider'> {
  canvas: string; previousLayer: string; nextLayer: string; layerSlider: string; loading: string;
  tooLarge: string; webglUnavailable: string; loadFailed: string; reduced: string;
}

export interface PreviewPanelProps {
  /** The saved slice output. The panel only reads it; the element gets its own copies. */
  gcode: ArrayBuffer;
  tier: TierDecision['tier'];
  orientation: 'horizontal' | 'vertical';
  labels: PreviewLabels;
  onLog?: (type: string, data: Record<string, unknown>) => void;
  /** Test seams. */
  webgl?: boolean;
  createAdapter?: CreateAdapter;
}

/**
 * Presentational-with-state panel: budget ladder + layer slider around <GcodePreview>. The ladder is
 * enforced by filtering the G-code text before it reaches the element (see layer-filter.ts). When it
 * ends at `unavailable` only a notice is shown; estimates and Save live outside this panel.
 */
export function PreviewPanel(props: PreviewPanelProps): JSX.Element {
  const bytes = createMemo(() => new Uint8Array(props.gcode));
  const index = createMemo(() => indexGcodeLayers(bytes()));
  const count = () => Math.max(1, index().layerCount);
  const [layer, setLayer] = createSignal(count() - 1);
  const [minimum, setMinimum] = createSignal<PreviewStage>('all-visible');
  const [reloadKey, setReloadKey] = createSignal(0);
  const [failed, setFailed] = createSignal(false);
  const webgl = props.webgl ?? webglAvailable();

  // A new slice result starts over at its top layer with the full ladder.
  createEffect(on(() => props.gcode, () => { setLayer(count() - 1); setMinimum('all-visible'); setFailed(false); }, { defer: true }));

  const plan = createMemo(() => planPreview({ gcodeBytes: bytes().byteLength, tier: props.tier, totalLayers: count(),
    currentLayer: layer(), minimumStage: minimum() }));
  const stage = createMemo(() => plan().stage);
  const source = createMemo(() => previewSourceFor(bytes(), index(), plan(), layer()));

  createEffect(on(stage, (next, previous) => props.onLog?.('preview-stage', { stage: next, from: previous,
    tier: props.tier, layers: count(), estimatedGpuBytes: plan().estimatedGpuBytes, budgetBytes: plan().budgetBytes }), { defer: true }));

  const lost = () => {
    const from = stage(); const to = nextPreviewStage(from);
    props.onLog?.('preview-context-lost', { from, to });
    setMinimum(to);
  };

  const showPreview = () => webgl && !failed() && stage() !== 'unavailable';
  return (
    <div class="gcode-preview" data-orientation={props.orientation} role="region" aria-label={props.labels.canvas}>
      <Show when={showPreview()}>
        <Suspense fallback={<p class="gcode-preview__notice" role="status">{props.labels.loading}</p>}>
          <GcodePreview source={source()} reloadKey={reloadKey()} createAdapter={props.createAdapter}
            onContextLost={lost} onContextRestored={() => setReloadKey(key => key + 1)}
            onError={error => { props.onLog?.('preview-error', { message: error instanceof Error ? error.message : String(error) }); setFailed(true); }} />
        </Suspense>
        <Show when={stage() === 'window' || stage() === 'decimated'}>
          <p class="gcode-preview__hint" role="status">{props.labels.reduced}</p>
        </Show>
        <div class="gcode-preview__controls">
          <LayerSlider value={layer()} count={count()} height={index().layerZ[layer()]} orientation={props.orientation}
            labels={{ layer: props.labels.layer, height: props.labels.height, previous: props.labels.previousLayer,
              next: props.labels.nextLayer, slider: props.labels.layerSlider }}
            onChange={setLayer} />
        </div>
      </Show>
      <Show when={!webgl}><p class="gcode-preview__notice" role="status">{props.labels.webglUnavailable}</p></Show>
      <Show when={webgl && failed()}><p class="gcode-preview__notice" role="status">{props.labels.loadFailed}</p></Show>
      <Show when={webgl && !failed() && stage() === 'unavailable'}><p class="gcode-preview__notice" role="status">{props.labels.tooLarge}</p></Show>
    </div>
  );
}
