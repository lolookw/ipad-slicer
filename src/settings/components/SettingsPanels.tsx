import { For, Show } from 'solid-js';
import type { NativeSettings } from '../../catalog/types';
import { decodeNative } from '../codec';
import { BRIM_TYPES, SETTINGS, SUPPORT_TYPES, type SettingKey, type SettingValue } from '../schema';
import type { Quality } from '../ladder';
import { selectedBedTemperatureKey } from '../virtual';

export interface SettingsLabels {
  mode: string; modeSimple: string; modeAdvanced: string; infill: string; supports: string; supportType: string;
  brimType: string; brimWidth: string; arrange: string; estimates: string; unavailable: string;
  reset: string; plateWide: string; categories: Record<AdvancedCategory, string>;
  setting: (key: SettingKey) => string;
  optionLabel: (key: SettingKey, value: string) => string;
}
export interface SettingsPanelProps {
  mode: 'simple' | 'advanced'; values?: NativeSettings; overrides: Partial<Record<SettingKey, SettingValue>>;
  labels: SettingsLabels; onMode: (mode: 'simple' | 'advanced') => void;
  onChange: (key: SettingKey, value: SettingValue) => void; onReset: (key: SettingKey) => void; onArrange: () => void;
}

const CATEGORIES = {
  quality: ['layer_height', 'initial_layer_print_height', 'ironing_type', 'seam_position'],
  strength: ['wall_loops', 'top_shell_layers', 'bottom_shell_layers', 'sparse_infill_pattern'],
  speed: ['outer_wall_speed', 'inner_wall_speed', 'sparse_infill_speed', 'travel_speed', 'initial_layer_speed'],
  support: ['enable_support', 'support_type', 'support_threshold_angle', 'support_on_build_plate_only', 'brim_type', 'brim_width'],
  others: ['curr_bed_type', 'nozzle_temperature', 'nozzle_temperature_initial_layer', 'fuzzy_skin', 'use_relative_e_distances', 'gcode_flavor', 'machine_start_gcode', 'machine_end_gcode', 'filament_cost', 'filament_density'],
} as const satisfies Record<string, readonly SettingKey[]>;
type AdvancedCategory = keyof typeof CATEGORIES;

function decoded(values: NativeSettings | undefined, key: SettingKey): SettingValue | undefined {
  const value = values?.[key];
  if (value === undefined) return undefined;
  try { return decodeNative(SETTINGS[key], value); } catch { return undefined; }
}
function scalar(value: SettingValue | undefined): string | number | boolean {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
function unit(key: SettingKey): string {
  if (key.includes('temperature')) return '°C';
  if (key.includes('speed')) return 'mm/s';
  if (key.includes('density') && key !== 'filament_density') return '%';
  if (key.includes('height') || key.includes('width') || key === 'nozzle_diameter') return 'mm';
  return '';
}

export function SettingsPanels(props: SettingsPanelProps) {
  const read = (key: SettingKey) => props.overrides[key] ?? decoded(props.values, key);
  const change = (key: SettingKey, target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    const definition = SETTINGS[key];
    const value: SettingValue = definition.type === 'bool' ? (target as HTMLInputElement).checked
      : ['float', 'int', 'percent'].includes(definition.type) ? Number(target.value) : target.value;
    props.onChange(key, definition.vector ? [value] : value);
  };
  return <section class="settings-panels">
    <div class="mode-switch" role="group" aria-label={props.labels.mode}>
      <button class="ui-target" type="button" aria-pressed={props.mode === 'simple'} onClick={() => props.onMode('simple')}>{props.labels.modeSimple}</button>
      <button class="ui-target" type="button" aria-pressed={props.mode === 'advanced'} onClick={() => props.onMode('advanced')}>{props.labels.modeAdvanced}</button>
    </div>
    <Show when={props.mode === 'simple'}>
      <label class="control-entry" data-simple-entry>{props.labels.infill}<input class="ui-target" type="number" min="0" max="100" value={String(scalar(read('sparse_infill_density')))} onChange={event => change('sparse_infill_density', event.currentTarget)} /></label>
      <label class="control-entry" data-simple-entry><input class="ui-target" type="checkbox" checked={Boolean(scalar(read('enable_support')))} onChange={event => change('enable_support', event.currentTarget)} />{props.labels.supports}</label>
      <Show when={Boolean(scalar(read('enable_support')))}><label class="control-entry" data-simple-entry>{props.labels.supportType}<select class="ui-target" value={String(scalar(read('support_type')))} onChange={event => change('support_type', event.currentTarget)}>{SUPPORT_TYPES.map(value => <option value={value}>{props.labels.optionLabel('support_type', value)}</option>)}</select></label></Show>
      <label class="control-entry" data-simple-entry>{props.labels.brimType}<select class="ui-target" value={String(scalar(read('brim_type')))} onChange={event => change('brim_type', event.currentTarget)}>{BRIM_TYPES.map(value => <option value={value}>{props.labels.optionLabel('brim_type', value)}</option>)}</select></label>
      <label class="control-entry" data-simple-entry>{props.labels.brimWidth}<input class="ui-target" type="number" min="0" max="100" value={String(scalar(read('brim_width')))} onChange={event => change('brim_width', event.currentTarget)} /></label>
      <button class="ui-target control-entry" data-simple-entry type="button" onClick={props.onArrange}>{props.labels.arrange}</button>
      <output class="estimate-readout">{props.labels.estimates}: {props.labels.unavailable}</output>
      <p class="plate-wide-note">{props.labels.plateWide}</p>
    </Show>
    <Show when={props.mode === 'advanced'}><For each={Object.entries(CATEGORIES) as [AdvancedCategory, readonly SettingKey[]][]}>{([category, keys]) =>
      <details open><summary>{props.labels.categories[category]}</summary><div class="advanced-grid"><For each={category === 'others' && selectedBedTemperatureKey(props.values ?? {}) ? [...keys, selectedBedTemperatureKey(props.values ?? {})!, `${selectedBedTemperatureKey(props.values ?? {})!}_initial_layer`] as SettingKey[] : keys}>{key =>
        <Show when={read(key) !== undefined}><SettingField settingKey={key} value={scalar(read(key))} label={props.labels.setting(key)} overridden={props.overrides[key] !== undefined}
          resetLabel={props.labels.reset} optionLabel={props.labels.optionLabel} onChange={target => change(key, target)} onReset={() => props.onReset(key)} /></Show>
      }</For></div></details>}</For><p class="plate-wide-note">{props.labels.plateWide}</p></Show>
  </section>;
}

function SettingField(props: { settingKey: SettingKey; value: string | number | boolean; label: string; overridden: boolean; resetLabel: string; optionLabel: (key: SettingKey, value: string) => string; onChange: (target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => void; onReset: () => void }) {
  const definition = SETTINGS[props.settingKey];
  return <div class="setting-row"><label>{props.label}<Show when={definition.enum} fallback={<Show when={definition.type === 'bool'} fallback={<Show when={definition.type === 'gcode'} fallback={<input class="ui-target" type="number" min={definition.min} max={definition.max} value={String(props.value)} onChange={event => props.onChange(event.currentTarget)} />}><textarea class="ui-target" value={String(props.value)} onChange={event => props.onChange(event.currentTarget)} /></Show>}><input class="ui-target" type="checkbox" checked={Boolean(props.value)} onChange={event => props.onChange(event.currentTarget)} /></Show>}>
    <select class="ui-target" value={String(props.value)} onChange={event => props.onChange(event.currentTarget)}>{definition.enum?.map(value => <option value={value}>{props.optionLabel(props.settingKey, value)}</option>)}</select></Show> <span>{unit(props.settingKey)}</span></label>
    <button class="ui-target" type="button" disabled={!props.overridden} onClick={props.onReset}>{props.resetLabel}</button></div>;
}
