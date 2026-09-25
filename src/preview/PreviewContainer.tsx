import { createSignal, onCleanup, type JSX } from 'solid-js';
import { useApp } from '../app/AppProvider';
import { plate } from '../app/stores/plate';
import { resolvedSettings } from '../app/stores/configuration';
import { bedSizeFromSettings } from '../viewer/bed';
import { diagnosticsLog } from '../instrumentation/log';
import { PreviewPanel, type PreviewLabels } from './PreviewPanel';
import type { ColorModeName, PreviewBuildVolume } from './adapter';
import type { PreviewOptionsLabels } from './PreviewOptionsPanel';

/**
 * Bug fix (real iPad report): the G-code preview never told the pinned library about the machine's
 * real bed, so it drew NO plate at all and framed only the raw toolpath — which sits at its true
 * OrcaSlicer G-code coordinates (corner-origin, e.g. 0..width), not this app's own centered display
 * convention. A model that looked centered in the regular 3D viewer (which draws its bed centered on
 * the origin) could then look displaced or "outside the plate" in the preview, which drew no bed
 * reference at all to judge that against.
 *
 * Falls back to the same default bed footprint `ViewerWorkspace.tsx`/`ViewerToolbarContainer.tsx`
 * already use when no printer profile is configured yet.
 */
const DEFAULT_BED_FOOTPRINT = { widthMm: 220, depthMm: 220, heightMm: 250 };

function previewBuildVolume(): PreviewBuildVolume {
  const settings = resolvedSettings();
  const bed = settings ? bedSizeFromSettings(settings) : DEFAULT_BED_FOOTPRINT;
  return { x: bed.widthMm, y: bed.depthMm, z: bed.heightMm };
}

function createOrientationSignal() {
  const query = globalThis.matchMedia?.('(orientation: landscape)');
  const [landscape, setLandscape] = createSignal(query?.matches ?? false);
  if (query) {
    const update = (event: MediaQueryListEvent) => setLandscape(event.matches);
    query.addEventListener('change', update);
    onCleanup(() => query.removeEventListener('change', update));
  }
  // Portrait: horizontal slider at the bottom. Landscape: vertical slider at the right edge.
  return () => (landscape() ? 'vertical' : 'horizontal') as 'horizontal' | 'vertical';
}

/** Reads app context (tier, locale, log) and hands the saved G-code to the presentational panel. */
export function PreviewContainer(props: { gcode: ArrayBuffer }): JSX.Element {
  const app = useApp();
  const orientation = createOrientationSignal();
  const optionsLabels = (): PreviewOptionsLabels => ({
    toggle: app.t('preview.optionsToggle'),
    colorMode: app.t('preview.colorMode'),
    colorModeNames: {
      single: app.t('preview.colorModeSingle'), feature: app.t('preview.colorModeFeature'), feedrate: app.t('preview.colorModeFeedrate'),
      layerHeight: app.t('preview.colorModeLayerHeight'), object: app.t('preview.colorModeObject'), tool: app.t('preview.colorModeTool'),
      filament: app.t('preview.colorModeFilament'), colorChange: app.t('preview.colorModeColorChange'), moveKind: app.t('preview.colorModeMoveKind'),
      power: app.t('preview.colorModePower'),
    } satisfies Record<ColorModeName, string>,
    featureLegend: app.t('preview.featureLegend'),
    featureRoleNames: {
      perimeter: app.t('preview.featurePerimeter'), externalPerimeter: app.t('preview.featureExternalPerimeter'),
      infill: app.t('preview.featureInfill'), solidInfill: app.t('preview.featureSolidInfill'), support: app.t('preview.featureSupport'),
      skirt: app.t('preview.featureSkirt'), brim: app.t('preview.featureBrim'), bridge: app.t('preview.featureBridge'),
      travel: app.t('preview.featureTravel'), primeTower: app.t('preview.featurePrimeTower'), wipeTower: app.t('preview.featureWipeTower'),
      raft: app.t('preview.featureRaft'), purge: app.t('preview.featurePurge'),
    },
    declutter: app.t('preview.declutter'),
    travel: app.t('preview.showTravel'), wipe: app.t('preview.showWipe'), retractions: app.t('preview.showRetractions'),
    viewPresets: app.t('preview.viewPresets'), fit: app.t('preview.viewFit'), top: app.t('preview.viewTop'), front: app.t('preview.viewFront'), iso: app.t('preview.viewIso'),
    saveImage: app.t('preview.saveImage'), saveImageBusy: app.t('preview.saveImageBusy'),
    estimatedTime: app.t('preview.estimatedTime'), kinematicNote: app.t('preview.kinematicNote'),
  });
  const labels = (): PreviewLabels => ({
    canvas: app.t('preview.canvas'), layer: app.t('preview.layer'), height: app.t('preview.height'),
    previousLayer: app.t('preview.previousLayer'), nextLayer: app.t('preview.nextLayer'), layerSlider: app.t('preview.layerSlider'),
    loading: app.t('preview.loading'), tooLarge: app.t('preview.tooLarge'), webglUnavailable: app.t('preview.webglUnavailable'),
    loadFailed: app.t('preview.loadFailed'), reduced: app.t('preview.reduced'),
    options: optionsLabels(),
  });
  return <PreviewPanel gcode={props.gcode} tier={app.tierDecision().tier} orientation={orientation()} labels={labels()}
    buildVolume={previewBuildVolume()}
    modelName={plate.state.objects[0]?.name}
    onLog={(type, data) => diagnosticsLog.append(type, data)} />;
}
