import { createEffect, createMemo, createSignal, lazy, on, Show, Suspense, type JSX } from 'solid-js';
import type { TierDecision } from '../app/tier/decide';
import { planPreview, nextPreviewStage, type PreviewStage } from './budget';
import type { CameraView, ColorModeName, FeatureRoleValue, PreviewBuildVolume, PreviewState } from './adapter';
import type { Adapter, CreateAdapter } from './GcodePreview';
import { webglAvailable } from './webgl';
import { indexGcodeLayers, previewSourceFor } from './layer-filter';
// Already part of the main bundle (src/app/AppProvider.tsx imports it statically for G-code Save);
// importing it the same way here avoids an ineffective dynamic-import chunk for no code-split gain.
import { previewImageFileName, savePreviewImage } from '../export/save-gcode';
import { LayerSlider, type LayerSliderLabels } from './LayerSlider';
import { PreviewOptionsPanel, type PreviewOptionsLabels } from './PreviewOptionsPanel';
import './preview.css';

// The library-backed adapter and the element live in their own chunk.
const GcodePreview = lazy(() => import('./GcodePreview').then(module => ({ default: module.GcodePreview })));

export interface PreviewLabels extends Omit<LayerSliderLabels, 'previous' | 'next' | 'slider'> {
  canvas: string; previousLayer: string; nextLayer: string; layerSlider: string; loading: string;
  tooLarge: string; webglUnavailable: string; loadFailed: string; reduced: string;
  options: PreviewOptionsLabels;
}

export interface PreviewPanelProps {
  /** The saved slice output. The panel only reads it; the element gets its own copies. */
  gcode: ArrayBuffer;
  tier: TierDecision['tier'];
  orientation: 'horizontal' | 'vertical';
  /** The configured machine's real bed (corner-origin mm, same convention as the G-code itself).
   *  Undefined draws no plate at all — see `adapter.ts`'s `PreviewBuildVolume`. */
  buildVolume?: PreviewBuildVolume;
  labels: PreviewLabels;
  /** Base name for the "Save preview image" file (same convention as the G-code's own file name). */
  modelName?: string;
  onLog?: (type: string, data: Record<string, unknown>) => void;
  /** Test seams. */
  webgl?: boolean;
  createAdapter?: CreateAdapter;
}

const DEFAULT_COLOR_MODE: ColorModeName = 'single';

/**
 * Presentational-with-state panel: budget ladder + layer slider + preview options around
 * <GcodePreview>. The ladder is enforced by filtering the G-code text before it reaches the element
 * (see layer-filter.ts). When it ends at `unavailable` only a notice is shown; estimates and Save
 * live outside this panel.
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

  // Preview options state. Color mode / declutter / travel / wipe / retractions are persistent user
  // choices (reactive props on <GcodePreview>, re-applied verbatim if the element is ever re-created,
  // e.g. after a context restore); camera view/capture are one-shot commands run through the adapter
  // handle GcodePreview hands up via onReady.
  const [colorMode, setColorMode] = createSignal<ColorModeName>(DEFAULT_COLOR_MODE);
  const [hiddenRoles, setHiddenRoles] = createSignal<ReadonlySet<FeatureRoleValue>>(new Set());
  const [showTravel, setShowTravel] = createSignal(true);
  const [showWipe, setShowWipe] = createSignal(true);
  const [showRetractions, setShowRetractions] = createSignal(false);
  const [previewState, setPreviewState] = createSignal<PreviewState | null>(null);
  const [adapterHandle, setAdapterHandle] = createSignal<Adapter | undefined>();
  const [captureBusy, setCaptureBusy] = createSignal(false);

  // A new slice result starts over at its top layer with the full ladder, and with default preview options.
  createEffect(on(() => props.gcode, () => {
    setLayer(count() - 1); setMinimum('all-visible'); setFailed(false);
    setColorMode(DEFAULT_COLOR_MODE); setHiddenRoles(new Set<FeatureRoleValue>()); setShowTravel(true); setShowWipe(true); setShowRetractions(false);
    setPreviewState(null);
  }, { defer: true }));

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

  const toggleRole = (role: FeatureRoleValue, visible: boolean) => setHiddenRoles(previous => {
    const next = new Set<FeatureRoleValue>(previous);
    if (visible) next.delete(role); else next.add(role);
    return next;
  });

  const onView = async (command: 'fit' | CameraView) => {
    const adapter = adapterHandle();
    if (!adapter) return;
    if (command === 'fit') adapter.frame(); else adapter.setView(command);
  };

  const onCapture = async () => {
    const adapter = adapterHandle();
    if (!adapter || captureBusy()) return;
    setCaptureBusy(true);
    try {
      const blob = await adapter.capture();
      props.onLog?.('preview-capture', { bytes: blob.size, type: blob.type });
      const saved = await savePreviewImage(blob, previewImageFileName(props.modelName ?? 'model.stl', blob.type));
      props.onLog?.('preview-capture-save', { ...saved });
    } catch (error) {
      props.onLog?.('preview-capture-error', { message: error instanceof Error ? error.message : String(error) });
    } finally {
      setCaptureBusy(false);
    }
  };

  const showPreview = () => webgl && !failed() && stage() !== 'unavailable';
  return (
    <div class="gcode-preview" data-orientation={props.orientation} role="region" aria-label={props.labels.canvas}>
      <Show when={showPreview()}>
        <Suspense fallback={<p class="gcode-preview__notice" role="status">{props.labels.loading}</p>}>
          <GcodePreview source={source()} reloadKey={reloadKey()} createAdapter={props.createAdapter} buildVolume={props.buildVolume}
            colorMode={colorMode()} hiddenFeatureRoles={[...hiddenRoles()]} showTravel={showTravel()} showWipe={showWipe()} showRetractions={showRetractions()}
            onContextLost={lost} onContextRestored={() => setReloadKey(key => key + 1)}
            onStateChange={setPreviewState} onReady={setAdapterHandle}
            onError={error => { props.onLog?.('preview-error', { message: error instanceof Error ? error.message : String(error) }); setFailed(true); }} />
        </Suspense>
        <Show when={stage() === 'window' || stage() === 'decimated'}>
          <p class="gcode-preview__hint" role="status">{props.labels.reduced}</p>
        </Show>
        <PreviewOptionsPanel state={previewState()} stage={stage()}
          colorMode={colorMode()} onColorModeChange={setColorMode}
          hiddenRoles={hiddenRoles()} onToggleRole={toggleRole}
          showTravel={showTravel()} onShowTravelChange={setShowTravel}
          showWipe={showWipe()} onShowWipeChange={setShowWipe}
          showRetractions={showRetractions()} onShowRetractionsChange={setShowRetractions}
          onView={command => void onView(command)} onCapture={() => void onCapture()} captureBusy={captureBusy()}
          labels={props.labels.options} />
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
