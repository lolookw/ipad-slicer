import { createUniqueId, For, Show } from 'solid-js';
import { clampStep, type StepperProps } from './Stepper';

export type SliderProps = Omit<StepperProps, 'decrementLabel' | 'incrementLabel'> & { ticks?: readonly number[] };
export function Slider(props: SliderProps) {
  const id = createUniqueId();
  let dragging = false;
  const commit = (value: number) => { if (!props.disabled) props.onChange(clampStep(value, props.min, props.max, props.step)); };
  const pointer = (e: PointerEvent & { currentTarget: HTMLInputElement }) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    if (bounds.width > 0) commit(props.min + (e.clientX - bounds.left) / bounds.width * (props.max - props.min));
  };
  return <label>{props.label} <output for={id}>{props.value}{props.unit}</output>
    <input id={id} class="ui-target ui-slider" type="range" aria-label={props.label} aria-valuetext={`${props.value}${props.unit ?? ''}`}
      min={props.min} max={props.max} step={props.step ?? 1} value={props.value} disabled={props.disabled} list={props.ticks ? `${id}-ticks` : undefined}
      onInput={e => commit(e.currentTarget.valueAsNumber)}
      onPointerDown={e => { if (props.disabled) return; e.preventDefault(); dragging = true; e.currentTarget.focus(); e.currentTarget.setPointerCapture?.(e.pointerId); pointer(e); }}
      onPointerMove={e => { if (dragging) pointer(e); }} onPointerUp={() => { dragging = false; }} onPointerCancel={() => { dragging = false; }}
      onKeyDown={e => {
        const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (delta === undefined && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        commit(e.key === 'Home' ? props.min : e.key === 'End' ? props.max : props.value + (delta ?? 0) * (props.step ?? 1));
      }} />
    <Show when={props.ticks}><datalist id={`${id}-ticks`}><For each={props.ticks}>{tick => <option value={tick} />}</For></datalist></Show>
  </label>;
}
