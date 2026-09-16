import { createSignal, For, Show } from 'solid-js';
import type { CatalogIndex, PrinterPack } from '../types';
import { searchPrinters } from '../index-client';
import { availableQualityLadder, type Quality } from '../../settings/ladder';

export interface CatalogPickersProps {
  index?: CatalogIndex; pack?: PrinterPack; printerId?: string; customName?: string;
  filamentId?: string; processId?: string; loading: boolean; error?: string;
  labels: Record<'search' | 'printer' | 'filament' | 'quality' | 'loading' | 'unavailable' | Quality, string>;
  onPrinter: (id: string) => void; onFilament: (id: string) => void; onQuality: (quality: Quality) => void;
}

export function CatalogPickers(props: CatalogPickersProps) {
  const [query, setQuery] = createSignal('');
  const models = () => props.index ? searchPrinters(props.index, query()) : [];
  const ladder = () => props.pack && props.filamentId ? availableQualityLadder(props.pack, props.filamentId) : {};
  return <>
    <label class="control-entry" data-simple-entry>{props.labels.printer}
      <input class="ui-target" type="search" aria-label={props.labels.search} value={query()} onInput={event => setQuery(event.currentTarget.value)} />
      <select class="ui-target" aria-label={props.labels.printer} value={props.printerId ?? ''}
        disabled={!props.index || props.loading} onChange={event => props.onPrinter(event.currentTarget.value)}>
        <option value="">—</option>
        <Show when={props.customName}><option value={props.printerId}>{props.customName} ({props.labels.unavailable})</option></Show>
        <For each={models()}>{model => <option value={model.id}>{model.name} · {model.nozzle} mm</option>}</For>
      </select>
      <Show when={props.loading}><small>{props.labels.loading}</small></Show>
      <Show when={props.error}><small class="field-error" role="alert">{props.error}</small></Show>
    </label>
    <label class="control-entry" data-simple-entry>{props.labels.filament}
      <select class="ui-target" aria-label={props.labels.filament} value={props.filamentId ?? ''} disabled={!props.pack}
        onChange={event => props.onFilament(event.currentTarget.value)}>
        <option value="">—</option><For each={props.pack?.filaments}>{filament =>
          <option value={filament.id}>{filament.name}</option>}</For>
      </select>
    </label>
    <fieldset class="control-entry" data-simple-entry disabled={!props.filamentId}>
      <legend>{props.labels.quality}</legend>
      <For each={['draft', 'standard', 'fine'] as const}>{quality => <button class="ui-target" type="button"
        aria-pressed={props.processId === ladder()[quality]} disabled={!ladder()[quality]} onClick={() => props.onQuality(quality)}>
        {props.labels[quality]}</button>}</For>
    </fieldset>
  </>;
}
