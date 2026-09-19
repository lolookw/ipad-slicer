import { createSignal, onCleanup, type JSX } from 'solid-js';
import { useApp } from '../app/AppProvider';
import { diagnosticsLog } from '../instrumentation/log';
import { PreviewPanel, type PreviewLabels } from './PreviewPanel';

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
  const labels = (): PreviewLabels => ({
    canvas: app.t('preview.canvas'), layer: app.t('preview.layer'), height: app.t('preview.height'),
    previousLayer: app.t('preview.previousLayer'), nextLayer: app.t('preview.nextLayer'), layerSlider: app.t('preview.layerSlider'),
    loading: app.t('preview.loading'), tooLarge: app.t('preview.tooLarge'), webglUnavailable: app.t('preview.webglUnavailable'),
    loadFailed: app.t('preview.loadFailed'), reduced: app.t('preview.reduced'),
  });
  return <PreviewPanel gcode={props.gcode} tier={app.tierDecision().tier} orientation={orientation()} labels={labels()}
    onLog={(type, data) => diagnosticsLog.append(type, data)} />;
}
