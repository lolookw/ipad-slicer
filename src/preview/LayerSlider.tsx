import { createEffect, createSignal, on, onCleanup, Show, type JSX } from 'solid-js';
import './preview.css';

export interface LayerSliderLabels { layer: string; height: string; previous: string; next: string; slider: string }
export interface LayerSliderProps {
  /** 0-based index of the topmost visible layer (the slider shows layers 1..value+1). */
  value: number;
  count: number;
  /** Z height of the current layer in mm, when the G-code carries it. */
  height?: number;
  orientation: 'horizontal' | 'vertical';
  labels: LayerSliderLabels;
  onChange: (value: number) => void;
}

const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 80;

function formatHeight(z: number): string { return `${Number(z.toFixed(2))} mm`; }

/**
 * Presentational single-thumb "current layer" control. Portrait lays it out horizontally at the
 * bottom of the preview, landscape vertically at the right edge (layout lives in preview.css).
 * The label follows the thumb immediately; `onChange` is coalesced to one call per animation frame.
 */
export function LayerSlider(props: LayerSliderProps): JSX.Element {
  const [shown, setShown] = createSignal(props.value);
  let frame: number | undefined;
  let pending: number | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let repeated = false;

  const max = () => Math.max(0, props.count - 1);
  const inert = () => props.count <= 1;
  const clamp = (value: number) => Math.min(max(), Math.max(0, Math.round(value)));

  createEffect(on(() => props.value, value => setShown(clamp(value)), { defer: true }));

  const emit = () => {
    frame = undefined;
    if (pending === undefined) return;
    const value = pending; pending = undefined;
    props.onChange(value);
  };
  const request = (value: number) => {
    if (inert() || !Number.isFinite(value)) return;
    const next = clamp(value);
    setShown(next);
    pending = next;
    frame ??= requestAnimationFrame(emit);
  };
  const stopHold = () => { clearTimeout(holdTimer); holdTimer = undefined; };
  const hold = (direction: number) => {
    stopHold(); repeated = false;
    request(shown() + direction);
    const repeat = () => { repeated = true; request(shown() + direction); holdTimer = setTimeout(repeat, HOLD_REPEAT_MS); };
    holdTimer = setTimeout(repeat, HOLD_DELAY_MS);
  };
  onCleanup(() => { stopHold(); if (frame !== undefined) cancelAnimationFrame(frame); });

  const stepper = (direction: 1 | -1, label: string, glyph: string) => (
    <button type="button" class="ui-target layer-slider__step" aria-label={label}
      disabled={inert() || (direction < 0 ? shown() <= 0 : shown() >= max())}
      onPointerDown={event => { event.currentTarget.setPointerCapture?.(event.pointerId); hold(direction); }}
      onPointerUp={stopHold} onPointerCancel={stopHold} onLostPointerCapture={stopHold}
      // Pointer taps already stepped on pointerdown; only keyboard/assistive clicks (detail 0) step here.
      onClick={event => { if (event.detail === 0 && !repeated) request(shown() + direction); repeated = false; }}>{glyph}</button>
  );

  return (
    <div class="layer-slider" data-testid="layer-slider" data-orientation={props.orientation}>
      <div class="layer-slider__labels" aria-live="off">
        <output data-testid="layer-label">{`${props.labels.layer} ${shown() + 1} / ${props.count}`}</output>
        <Show when={props.height !== undefined && Number.isFinite(props.height)}>
          <output data-testid="layer-height">{`${props.labels.height} ${formatHeight(props.height!)}`}</output>
        </Show>
      </div>
      {stepper(1, props.labels.next, '+')}
      <div class="layer-slider__track">
        <input class="layer-slider__input" type="range" aria-label={props.labels.slider} min={0} max={max()} step={1}
          value={shown()} disabled={inert()}
          aria-valuetext={`${props.labels.layer} ${shown() + 1} / ${props.count}`}
          onInput={event => request(event.currentTarget.valueAsNumber)} />
      </div>
      {stepper(-1, props.labels.previous, '−')}
    </div>
  );
}
