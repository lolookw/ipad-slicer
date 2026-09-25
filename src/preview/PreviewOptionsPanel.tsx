import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { DECLUTTER_ROLES, FEATURE_LEGEND, rgbToCss, type CameraView, type ColorModeName, type FeatureRoleValue, type PreviewState } from './adapter';
import type { PreviewStage } from './budget';
import { formatDurationMs } from './time-format';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import './preview.css';

export interface PreviewOptionsLabels {
  toggle: string;
  colorMode: string;
  colorModeNames: Record<ColorModeName, string>;
  featureLegend: string;
  /** Keyed by the legend's own `key` (perimeter/skirt/brim/support/…), shared with the declutter row. */
  featureRoleNames: Record<string, string>;
  declutter: string;
  travel: string; wipe: string; retractions: string;
  viewPresets: string; fit: string; top: string; front: string; iso: string;
  saveImage: string; saveImageBusy: string;
  estimatedTime: string; kinematicNote: string;
}

export interface PreviewOptionsPanelProps {
  /** The library's own capability-honest snapshot; null before the first parse-complete. */
  state: PreviewState | null;
  /** From the budget ladder: `totalTimeMs` is only trustworthy over the WHOLE file at 'all-visible'. */
  stage: PreviewStage;
  colorMode: ColorModeName;
  onColorModeChange: (mode: ColorModeName) => void;
  hiddenRoles: ReadonlySet<FeatureRoleValue>;
  onToggleRole: (role: FeatureRoleValue, visible: boolean) => void;
  showTravel: boolean;
  onShowTravelChange: (visible: boolean) => void;
  showWipe: boolean;
  onShowWipeChange: (visible: boolean) => void;
  showRetractions: boolean;
  onShowRetractionsChange: (visible: boolean) => void;
  onView: (command: 'fit' | CameraView) => void;
  onCapture: () => void;
  captureBusy: boolean;
  labels: PreviewOptionsLabels;
}

const VIEW_COMMANDS = ['fit', 'top', 'front', 'iso'] as const;

/**
 * Presentational floating panel for the preview surface: color mode, the feature legend, declutter
 * checkboxes, travel/wipe/retraction toggles, camera view presets and "Save image" — everything this
 * panel offers is gated on the library's own capability signals (`state`), never guessed. Collapsed
 * by default so it never competes with the toolpath canvas for space (mirrors the Models drawer's own
 * "overlay, not a permanent sidebar" pattern in the main viewer).
 */
export function PreviewOptionsPanel(props: PreviewOptionsPanelProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const availableModes = createMemo(() => props.state?.availableColorModes ?? []);
  const featureRolesKnown = createMemo(() => props.state?.summary?.capabilities?.featureRoles === 'known');
  // Only ever shown for the full file (see PreviewPanel's reconciliation note): a window/decimated
  // stage's totalTimeMs covers just the loaded layers, not the whole print.
  const showStats = createMemo(() => props.stage === 'all-visible' && props.state?.timeEstimateSource === 'kinematic'
    && typeof props.state?.totalTimeMs === 'number');

  return (
    <div class="preview-options" data-open={open()}>
      <button type="button" class="ui-target preview-options__toggle" aria-expanded={open()} aria-controls="preview-options-panel"
        onClick={() => setOpen(value => !value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 13.3c.03-.2.05-.4.05-.6v-1.4c0-.2-.02-.4-.05-.6l1.9-1.5-1.5-2.6-2.2.8c-.3-.25-.65-.47-1-.65l-.35-2.3H9.75l-.35 2.3c-.35.18-.7.4-1 .65l-2.2-.8-1.5 2.6 1.9 1.5c-.03.2-.05.4-.05.6v1.4c0 .2.02.4.05.6l-1.9 1.5 1.5 2.6 2.2-.8c.3.25.65.47 1 .65l.35 2.3h4.5l.35-2.3c.35-.18.7-.4 1-.65l2.2.8 1.5-2.6-1.9-1.5Z" />
        </svg>
        <span>{props.labels.toggle}</span>
      </button>
      <Show when={open()}>
        <div class="preview-options__panel" id="preview-options-panel" role="group" aria-label={props.labels.toggle}>
          <Show when={availableModes().length > 0}>
            <section class="preview-options__group">
              <h3>{props.labels.colorMode}</h3>
              <Segmented label={props.labels.colorMode}
                options={availableModes().map(name => ({ value: name, label: props.labels.colorModeNames[name] }))}
                value={props.colorMode} onChange={value => props.onColorModeChange(value as ColorModeName)} />
            </section>
          </Show>
          <Show when={props.colorMode === 'feature'}>
            <section class="preview-options__group preview-options__legend">
              <h3>{props.labels.featureLegend}</h3>
              <ul>
                <For each={FEATURE_LEGEND}>{entry =>
                  <li>
                    <span class="preview-options__swatch" style={{ background: rgbToCss(entry.color) }} aria-hidden="true" />
                    {props.labels.featureRoleNames[entry.key]}
                  </li>}
                </For>
              </ul>
            </section>
          </Show>
          <Show when={featureRolesKnown()}>
            <section class="preview-options__group">
              <h3>{props.labels.declutter}</h3>
              <For each={DECLUTTER_ROLES}>{entry =>
                <label class="ui-target preview-options__check">
                  <input type="checkbox" checked={!props.hiddenRoles.has(entry.role)}
                    onChange={event => props.onToggleRole(entry.role, event.currentTarget.checked)} />
                  {props.labels.featureRoleNames[entry.key]}
                </label>}
              </For>
            </section>
          </Show>
          <section class="preview-options__group">
            <label class="ui-target preview-options__check">
              <input type="checkbox" checked={props.showTravel} onChange={event => props.onShowTravelChange(event.currentTarget.checked)} />
              {props.labels.travel}
            </label>
            <label class="ui-target preview-options__check">
              <input type="checkbox" checked={props.showWipe} onChange={event => props.onShowWipeChange(event.currentTarget.checked)} />
              {props.labels.wipe}
            </label>
            <Show when={props.state?.hasRetractions}>
              <label class="ui-target preview-options__check">
                <input type="checkbox" checked={props.showRetractions} onChange={event => props.onShowRetractionsChange(event.currentTarget.checked)} />
                {props.labels.retractions}
              </label>
            </Show>
          </section>
          <section class="preview-options__group" role="group" aria-label={props.labels.viewPresets}>
            <h3>{props.labels.viewPresets}</h3>
            <div class="preview-options__views">
              <For each={VIEW_COMMANDS}>{command =>
                <Button variant="secondary" data-view={command}
                  onClick={() => props.onView(command)}>{{ fit: props.labels.fit, top: props.labels.top, front: props.labels.front, iso: props.labels.iso }[command]}</Button>}
              </For>
            </div>
          </section>
          <section class="preview-options__group">
            <Button variant="secondary" loading={props.captureBusy} disabled={props.captureBusy} onClick={() => props.onCapture()}>
              {props.captureBusy ? props.labels.saveImageBusy : props.labels.saveImage}
            </Button>
          </section>
          <Show when={showStats()}>
            <p class="preview-options__stats" role="status">
              {props.labels.estimatedTime}: {formatDurationMs(props.state!.totalTimeMs!)} ({props.labels.kinematicNote})
            </p>
          </Show>
        </div>
      </Show>
    </div>
  );
}
