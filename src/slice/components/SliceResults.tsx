import { For, Show, createSignal, onCleanup, type JSX } from 'solid-js';
import type { SliceSummary } from '../summary';

export interface SliceResultLabels {
  time: string; mass: string; cost: string; layers: string; unavailable: string;
  priceBasis: string; requested: string; effective: string; stale: string;
  slicing: string; preparing: string; ready: string; finishing: string; save: string;
}

function duration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600), minutes = Math.floor((rounded % 3600) / 60), remainder = rounded % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, `${remainder}s`].filter(Boolean).join(' ');
}

export function SliceActivity(props: { active: boolean; variant?: 'st' | 'mt'; finishing?: boolean; labels: SliceResultLabels }): JSX.Element {
  const [elapsed, setElapsed] = createSignal(0);
  let started = Date.now();
  const timer = setInterval(() => { if (props.active) setElapsed(Math.floor((Date.now() - started) / 1000)); else started = Date.now(); }, 250);
  onCleanup(() => clearInterval(timer));
  return <Show when={props.active || props.finishing}><p class="slice-activity" role="status">
    <Show when={props.active}><span aria-hidden="true" class="spinner" /> {props.variant ? `${props.labels.slicing} (${props.variant.toUpperCase()})` : props.labels.preparing}: {duration(elapsed())}</Show>
    <Show when={!props.active && props.finishing}>{props.labels.finishing}</Show>
  </p></Show>;
}

export function SliceResults(props: { summary: SliceSummary; stale: boolean; currency: string; labels: SliceResultLabels; onSave: () => void }): JSX.Element {
  const value = (number: number | undefined, render: (item: number) => string) => number === undefined ? props.labels.unavailable : render(number);
  const price = () => {
    const raw = props.summary.requested.filament_cost;
    const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return <section class="slice-results" data-testid="slice-result" aria-label={props.labels.ready}>
    <Show when={props.stale}><p class="stale-warning" role="alert">{props.labels.stale}</p></Show>
    <dl>
      <div><dt>{props.labels.time}</dt><dd>{value(props.summary.timeSeconds, duration)}</dd></div>
      <div><dt>{props.labels.mass}</dt><dd>{value(props.summary.filamentGrams, item => `${item.toFixed(2)} g`)}</dd></div>
      <div><dt>{props.labels.cost}</dt><dd>{props.summary.cost ? new Intl.NumberFormat(undefined, { style: 'currency', currency: props.summary.cost.currency }).format(props.summary.cost.amount) : props.labels.unavailable}</dd></div>
      <div><dt>{props.labels.priceBasis}</dt><dd>{price() === undefined ? props.labels.unavailable : `${price()} ${props.currency}/kg`}</dd></div>
      <div><dt>{props.labels.layers}</dt><dd>{props.summary.layerCount}</dd></div>
    </dl>
    <details><summary>{props.labels.requested} / {props.labels.effective}</summary>
      <table><thead><tr><th>{props.labels.requested}</th><th>{props.labels.effective}</th></tr></thead><tbody>
        <For each={props.summary.differences}>{difference => <tr><td><code>{difference.key} = {String(difference.requested)}</code></td><td><code>{difference.key} = {difference.effective}</code></td></tr>}</For>
      </tbody></table>
    </details>
    <button class="ui-target" type="button" onClick={props.onSave}>{props.labels.save}</button>
  </section>;
}
