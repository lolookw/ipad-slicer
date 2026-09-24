import { createMemo, createSignal, For } from 'solid-js';
import type { CustomFilamentBase, CustomFilamentValues } from '../custom-filament';

export interface CustomFilamentFormProps {
  bases: CustomFilamentBase[];
  labels: Record<'heading' | 'name' | 'base' | 'nozzle' | 'nozzleInitial' | 'bed' | 'bedInitial' | 'cost' | 'density' | 'save' | 'disclaimer', string>;
  onSubmit: (values: CustomFilamentValues) => void | Promise<void>;
}

export function CustomFilamentForm(props: CustomFilamentFormProps) {
  const [baseId, setBaseId] = createSignal(props.bases[0]?.id ?? '');
  // Picking a different base type re-fills the numeric fields below with ITS defaults (Solid only
  // re-applies `value` when this memo's source signal — the selected base — actually changes, so the
  // user can still freely type over any field afterward without fighting a controlled re-render).
  const base = createMemo(() => props.bases.find(candidate => candidate.id === baseId()) ?? props.bases[0]);
  return <form class="settings-form" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void props.onSubmit({
      name: String(data.get('name') ?? ''), baseId: String(data.get('base') ?? baseId()),
      nozzleTemperature: Number(data.get('nozzle')), nozzleTemperatureInitialLayer: Number(data.get('nozzleInitial')),
      bedTemperature: Number(data.get('bed')), bedTemperatureInitialLayer: Number(data.get('bedInitial')),
      costPerKg: Number(data.get('cost')), density: Number(data.get('density')),
    });
  }}>
    <h3>{props.labels.heading}</h3><p>{props.labels.disclaimer}</p>
    <label>{props.labels.name}<input class="ui-target" name="name" required maxlength="128" /></label>
    <label>{props.labels.base}<select class="ui-target" name="base" aria-label={props.labels.base} value={baseId()} onChange={event => setBaseId(event.currentTarget.value)} disabled={!props.bases.length}>
      <For each={props.bases}>{option => <option value={option.id}>{option.name}</option>}</For>
    </select></label>
    <label>{props.labels.nozzle}<input class="ui-target" name="nozzle" type="number" min="0" max="1500" value={base()?.nozzleTemperature ?? 0} required /></label>
    <label>{props.labels.nozzleInitial}<input class="ui-target" name="nozzleInitial" type="number" min="0" max="1500" value={base()?.nozzleTemperatureInitialLayer ?? 0} required /></label>
    <label>{props.labels.bed}<input class="ui-target" name="bed" type="number" min="0" max="300" value={base()?.bedTemperature ?? 0} required /></label>
    <label>{props.labels.bedInitial}<input class="ui-target" name="bedInitial" type="number" min="0" max="300" value={base()?.bedTemperatureInitialLayer ?? 0} required /></label>
    <label>{props.labels.cost}<input class="ui-target" name="cost" type="number" min="0" step="0.01" value={base()?.costPerKg ?? 0} required /></label>
    <label>{props.labels.density}<input class="ui-target" name="density" type="number" min="0" step="0.01" value={base()?.density ?? 0} required /></label>
    <button class="ui-target" type="submit" disabled={!props.bases.length}>{props.labels.save}</button>
  </form>;
}
