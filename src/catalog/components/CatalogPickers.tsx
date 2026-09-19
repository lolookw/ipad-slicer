import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import type { CatalogIndex, PrinterPack } from '../types';
import { groupPrinters } from '../printer-list';
import { availableQualityLadder, type Quality } from '../../settings/ladder';

export interface CatalogPickersProps {
  index?: CatalogIndex; pack?: PrinterPack; printerId?: string; customName?: string;
  filamentId?: string; processId?: string; loading: boolean; error?: string;
  labels: Record<'search' | 'printer' | 'filament' | 'quality' | 'loading' | 'unavailable' | 'recommended' | 'verified' | 'noResults' | Quality, string>;
  onPrinter: (id: string) => void; onFilament: (id: string) => void; onQuality: (quality: Quality) => void;
}

const SEARCH_DEBOUNCE_MS = 150;

export function CatalogPickers(props: CatalogPickersProps) {
  const [typed, setTyped] = createSignal('');
  const [query, setQuery] = createSignal('');
  createEffect(() => {
    const value = typed();
    const timer = setTimeout(() => setQuery(value), value ? SEARCH_DEBOUNCE_MS : 0);
    onCleanup(() => clearTimeout(timer));
  });
  const groups = () => props.index ? groupPrinters(props.index, query(), props.printerId) : undefined;
  const ladder = () => props.pack && props.filamentId ? availableQualityLadder(props.pack, props.filamentId) : {};
  return <>
    <label class="control-entry" data-simple-entry>{props.labels.printer}
      <input class="ui-target" type="search" aria-label={props.labels.search} value={typed()} onInput={event => setTyped(event.currentTarget.value)} />
      <select class="ui-target" aria-label={props.labels.printer} value={props.printerId ?? ''}
        disabled={!props.index || props.loading} onChange={event => props.onPrinter(event.currentTarget.value)}>
        <option value="">—</option>
        <Show when={props.customName}><option value={props.printerId}>{props.customName} ({props.labels.unavailable})</option></Show>
        <Show when={groups()?.recommended.length}>
          <optgroup label={props.labels.recommended}>
            <For each={groups()?.recommended}>{entry => <option value={entry.id}>{entry.label}</option>}</For>
          </optgroup>
        </Show>
        <For each={groups()?.vendors}>{vendor =>
          <optgroup label={`${vendor.name} · ${props.labels.verified}`}>
            <For each={vendor.models}>{entry => <option value={entry.id}>{entry.label}</option>}</For>
          </optgroup>}</For>
      </select>
      <Show when={props.index && groups()?.total === 0}><small role="status">{props.labels.noResults}</small></Show>
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
