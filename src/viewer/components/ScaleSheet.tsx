import { createEffect, createSignal, Show } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { fromMillimeters, toMillimeters, transformedSize, type DisplayUnit, type ObjectTransform } from '../transforms';

export type ScaleUnit = DisplayUnit | '%';

export interface ScaleSheetLabels {
  title: string;
  close: string;
  size: string;
  unit: string;
  suspicious: string;
  multiply25_4: string;
  multiply1000: string;
  divide10: string;
  keep: string;
  resize: string;
}

export interface ScaleSheetProps {
  open: boolean;
  object: PlateObject;
  labels: ScaleSheetLabels;
  onClose: () => void;
  onTransform: (transform: ObjectTransform) => void;
}

interface Baseline {
  size: [number, number, number];
  transform: ObjectTransform;
}

const largest = (size: readonly number[]) => Math.max(...size);
const suspicious = (size: readonly number[]) => largest(size) < 5 || largest(size) > 2000;
const scaled = (transform: ObjectTransform, factor: number): ObjectTransform => ({
  ...transform,
  scale: transform.scale.map(value => value * factor) as ObjectTransform['scale'],
});
const formatted = (value: number) => String(Number(value.toFixed(3)));

export function ScaleSheet(props: ScaleSheetProps) {
  const [unit, setUnit] = createSignal<ScaleUnit>('mm');
  const [baseline, setBaseline] = createSignal<Baseline>();
  const [showSuggestion, setShowSuggestion] = createSignal(false);
  let wasOpen = false;

  createEffect(() => {
    if (props.open && !wasOpen) {
      setBaseline({
        size: transformedSize(props.object.bounds, props.object.transform),
        transform: { ...props.object.transform, scale: [...props.object.transform.scale] },
      });
      setShowSuggestion(false);
      setUnit('mm');
    }
    wasOpen = props.open;
  });

  const displayedValue = () => {
    const size = transformedSize(props.object.bounds, props.object.transform);
    if (unit() === '%') {
      const initial = baseline();
      return initial && largest(initial.size) > 0 ? largest(size) / largest(initial.size) * 100 : 100;
    }
    return fromMillimeters(largest(size), unit() as DisplayUnit);
  };

  const apply = (transform: ObjectTransform) => {
    props.onTransform(transform);
    setShowSuggestion(suspicious(transformedSize(props.object.bounds, transform)));
  };

  const commit = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    if (unit() === '%') {
      const initial = baseline();
      if (initial) apply(scaled(initial.transform, value / 100));
      return;
    }
    const currentSize = transformedSize(props.object.bounds, props.object.transform);
    const currentLargest = largest(currentSize);
    if (currentLargest > 0) apply(scaled(props.object.transform, toMillimeters(value, unit() as DisplayUnit) / currentLargest));
  };

  const correct = (factor: number) => apply(scaled(props.object.transform, factor));

  return <Sheet open={props.open} onClose={props.onClose} label={props.labels.title} handleLabel={props.labels.resize}>
    <div class="viewer-scale-sheet">
      <header><h2>{props.labels.title}</h2><Button variant="ghost" onClick={props.onClose}>{props.labels.close}</Button></header>
      <Segmented label={props.labels.unit} value={unit()} onChange={value => setUnit(value as ScaleUnit)} options={[
        { value: 'mm', label: 'mm' }, { value: 'in', label: 'in' }, { value: '%', label: '%' },
      ]} />
      <label>{props.labels.size}
        <input class="ui-target" type="number" inputmode="decimal" min="0" step="any" value={formatted(displayedValue())}
          onChange={event => commit(event.currentTarget.valueAsNumber)} />
        <span aria-hidden="true">{unit()}</span>
      </label>
      <Show when={showSuggestion()}><section class="viewer-size-suggestion" role="status">
        <p>{props.labels.suspicious}</p>
        <div>
          <Button variant="secondary" onClick={() => correct(25.4)}>{props.labels.multiply25_4}</Button>
          <Button variant="secondary" onClick={() => correct(1000)}>{props.labels.multiply1000}</Button>
          <Button variant="secondary" onClick={() => correct(0.1)}>{props.labels.divide10}</Button>
          <Button variant="ghost" onClick={() => setShowSuggestion(false)}>{props.labels.keep}</Button>
        </div>
      </section></Show>
    </div>
  </Sheet>;
}
