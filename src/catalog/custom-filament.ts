import type { NativeSettings, PackFilament, PrinterPack } from './types';
import { selectedBedTemperatureKey } from '../settings/virtual';
import { SETTINGS, type SettingKey } from '../settings/schema';

/** Only these generic material families ship the safe, complete field set (nozzle/bed temperature
 * ranges, cost, density, ...) a new custom filament needs to be cloned from. */
const BASE_TYPES = new Set<PackFilament['type']>(['PLA', 'PETG', 'ABS']);

export interface CustomFilamentValues {
  name: string;
  baseId: string;
  nozzleTemperature: number;
  nozzleTemperatureInitialLayer: number;
  bedTemperature: number;
  bedTemperatureInitialLayer: number;
  costPerKg: number;
  density: number;
}

export interface CustomFilamentBase {
  id: string;
  name: string;
  type: PackFilament['type'];
  settings: NativeSettings;
  nozzleTemperature: number;
  nozzleTemperatureInitialLayer: number;
  bedTemperature: number;
  bedTemperatureInitialLayer: number;
  costPerKg: number;
  density: number;
}

export function nativeNumber(settings: NativeSettings, key: string, fallback: number): number {
  const value = settings[key];
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Which plate-temperature key is active for a pack's currently configured build plate, falling back to
 * the most widely supported plate (High Temp Plate — every generic base filament sets it) when the pack
 * does not pin one, e.g. the custom-printer base, which leaves the real choice to the user's printer. */
export function activeBedTemperatureKey(machine: NativeSettings): string {
  return selectedBedTemperatureKey(machine) ?? 'hot_plate_temp';
}

/** The generic filaments a custom filament can start from, reduced to the handful of fields the form
 * exposes. Only PLA/PETG/ABS-family entries qualify — anything else lacks a trusted, complete template. */
export function customFilamentBaseOptions(filaments: readonly PackFilament[], bedKey: string): CustomFilamentBase[] {
  return filaments.filter(filament => BASE_TYPES.has(filament.type)).map(filament => ({
    id: filament.id, name: filament.name, type: filament.type, settings: filament.settings,
    nozzleTemperature: nativeNumber(filament.settings, 'nozzle_temperature', 200),
    nozzleTemperatureInitialLayer: nativeNumber(filament.settings, 'nozzle_temperature_initial_layer', 200),
    bedTemperature: nativeNumber(filament.settings, bedKey, 60),
    bedTemperatureInitialLayer: nativeNumber(filament.settings, `${bedKey}_initial_layer`, 60),
    costPerKg: nativeNumber(filament.settings, 'filament_cost', 20),
    density: nativeNumber(filament.settings, 'filament_density', 1.24),
  }));
}

function requireRange(value: number, definition: { min?: number; max?: number }, label: string): void {
  if (!Number.isFinite(value) || (definition.min !== undefined && value < definition.min) || (definition.max !== undefined && value > definition.max))
    throw new Error(`${label} must be within the supported range.`);
}

/** Range checks reuse the exact SETTINGS bounds validateSettings()/the advanced panel already enforce,
 * so a custom filament can never claim a wider "safe" range than a catalog one. */
export function validateCustomFilamentValues(values: CustomFilamentValues, bedKey: string): void {
  if (!values.name.trim() || values.name.length > 128) throw new Error('Custom filament fields are invalid.');
  requireRange(values.nozzleTemperature, SETTINGS.nozzle_temperature, 'Nozzle temperature');
  requireRange(values.nozzleTemperatureInitialLayer, SETTINGS.nozzle_temperature_initial_layer, 'Initial nozzle temperature');
  const bedDefinition = (bedKey in SETTINGS ? SETTINGS[bedKey as SettingKey] : undefined) ?? { min: 0, max: 300 };
  requireRange(values.bedTemperature, bedDefinition, 'Bed temperature');
  requireRange(values.bedTemperatureInitialLayer, bedDefinition, 'Initial bed temperature');
  requireRange(values.costPerKg, SETTINGS.filament_cost, 'Filament cost');
  requireRange(values.density, SETTINGS.filament_density, 'Filament density');
}

/** Clones the base filament's full, engine-safe settings object (every field the smoke-tested generic
 * filaments set) and overrides only the handful of fields this form exposes, so the result is always a
 * complete NativeSettings — never a half-empty one — safe to send straight to the WASM engine. */
export function buildCustomFilamentSettings(base: NativeSettings, bedKey: string, values: CustomFilamentValues): NativeSettings {
  const settings: NativeSettings = {};
  for (const [key, value] of Object.entries(base)) settings[key] = Array.isArray(value) ? [...value] : value;
  settings.nozzle_temperature = [String(values.nozzleTemperature)];
  settings.nozzle_temperature_initial_layer = [String(values.nozzleTemperatureInitialLayer)];
  settings[bedKey] = [String(values.bedTemperature)];
  settings[`${bedKey}_initial_layer`] = [String(values.bedTemperatureInitialLayer)];
  settings.filament_cost = [String(values.costPerKg)];
  settings.filament_density = [String(values.density)];
  return settings;
}

export function buildCustomFilament(id: string, type: PackFilament['type'], base: NativeSettings, bedKey: string, values: CustomFilamentValues): PackFilament {
  return { id, name: values.name.trim(), type, settings: buildCustomFilamentSettings(base, bedKey, values) };
}

/** A custom filament is not individually smoke-tested against any one printer, exactly like a custom
 * printer's generic combos are trusted broadly — so it is made selectable at every quality level the
 * pack already offers, gated by the same validateSettings() every catalog combination goes through
 * before Slice unlocks. */
export function injectCustomFilaments(pack: PrinterPack, filaments: readonly PackFilament[]): PrinterPack {
  if (!filaments.length) return pack;
  const extraCombos: [string, string][] = pack.processes.flatMap(process => filaments.map(filament => [process.id, filament.id] as [string, string]));
  return { ...pack, filaments: [...pack.filaments, ...filaments], combos: [...pack.combos, ...extraCombos] };
}
