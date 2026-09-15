import { onCleanup } from 'solid-js';
import { Button } from './Button';

export interface StepperProps {
  label: string; value: number; onChange: (value: number) => void;
  min: number; max: number; step?: number; unit?: string; disabled?: boolean;
  decrementLabel?: string; incrementLabel?: string;
}
export function clampStep(value: number, min: number, max: number, step = 1) {
  return Math.min(max, Math.max(min, Number((min + Math.round((value - min) / step) * step).toFixed(10))));
}
export function Stepper(props: StepperProps) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let repeated = false;
  const stop = () => clearTimeout(timer);
  const commit = (value: number) => { if (!props.disabled && Number.isFinite(value)) props.onChange(clampStep(value, props.min, props.max, props.step)); };
  const move = (direction: number) => commit(props.value + direction * (props.step ?? 1));
  const start = (e: PointerEvent & { currentTarget: HTMLButtonElement }, direction: number) => {
    stop();
    repeated = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const repeat = () => { repeated = true; move(direction); timer = setTimeout(repeat, 100); };
    timer = setTimeout(repeat, 400);
  };
  onCleanup(stop);
  return <div class="ui-stepper" role="group" aria-label={props.label}>
    <Button variant="secondary" aria-label={props.decrementLabel ?? `Decrease ${props.label}`} disabled={props.disabled || props.value <= props.min}
      onPointerDown={e => start(e, -1)} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onClick={() => { if (!repeated) move(-1); repeated = false; }}>−</Button>
    <input class="ui-target" type="number" inputmode="decimal" aria-label={props.label} aria-valuetext={`${props.value}${props.unit ?? ''}`}
      value={props.value} min={props.min} max={props.max} step={props.step ?? 1} disabled={props.disabled}
      onChange={e => { commit(e.currentTarget.valueAsNumber); e.currentTarget.value = String(props.value); }} />
    <span aria-hidden="true">{props.unit}</span>
    <Button variant="secondary" aria-label={props.incrementLabel ?? `Increase ${props.label}`} disabled={props.disabled || props.value >= props.max}
      onPointerDown={e => start(e, 1)} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onClick={() => { if (!repeated) move(1); repeated = false; }}>+</Button>
  </div>;
}
