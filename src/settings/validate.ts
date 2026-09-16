import type { NativeSettings, NativeValue } from '../catalog/types';
import { decodeNative } from './codec';
import { isSettingKey, OBSOLETE_SETTINGS, SETTINGS, type SettingDef } from './schema';
import { selectedBedTemperatureKey } from './virtual';

export interface ValidationIssue { severity: 'error' | 'warning'; key: string; message: string }
export interface ValidationContext {
  nozzleDiameter: number;
  nozzleTemperature: readonly [min: number, max: number];
  bedTemperature: readonly [min: number, max: number];
  maxSpeed: number;
  isBambu?: boolean;
}

function values(definition: SettingDef, value: NativeValue): (number | boolean | string)[] {
  const decoded = decodeNative(definition, value);
  return Array.isArray(decoded) ? decoded : [decoded];
}
function number(config: NativeSettings, key: string): number | undefined {
  const value = config[key];
  if (value === undefined || !isSettingKey(key)) return undefined;
  const decoded = decodeNative(SETTINGS[key], value);
  const first = Array.isArray(decoded) ? decoded[0] : decoded;
  return typeof first === 'number' ? first : undefined;
}
function hasReset(value: NativeValue | undefined): boolean {
  const text = Array.isArray(value) ? value.join('\n') : value ?? '';
  return /(?:^|\n)\s*G92\s+E0(?:\s*(?:;[^\n]*)?)?(?=\n|$)/m.test(text);
}

export function validateSettings(config: NativeSettings, context: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (key: string, message: string) => issues.push({ severity: 'error', key, message });
  for (const key of Object.keys(config)) if (OBSOLETE_SETTINGS.has(key)) error(key, 'This setting is obsolete and must not be sent to the engine.');
  for (const [key, native] of Object.entries(config)) {
    if (!isSettingKey(key)) continue;
    const definition = SETTINGS[key];
    let decoded: (number | boolean | string)[];
    try { decoded = values(definition, native); } catch { error(key, 'The serialized value has the wrong type.'); continue; }
    for (const value of decoded) {
      if (definition.enum && (typeof value !== 'string' || !definition.enum.includes(value))) error(key, `Unsupported value ${value}.`);
      if (typeof value === 'number') {
        if (definition.type === 'int' && !Number.isInteger(value)) error(key, 'An integer is required.');
        if (definition.min !== undefined && value < definition.min) error(key, `Value must be at least ${definition.min}.`);
        if (definition.max !== undefined && value > definition.max) error(key, `Value must be at most ${definition.max}.`);
      }
    }
  }
  const layer = number(config, 'layer_height');
  const firstLayer = number(config, 'initial_layer_print_height');
  if (layer !== undefined && (layer <= 0 || layer > context.nozzleDiameter)) error('layer_height', 'Layer height must be positive and no greater than the nozzle diameter.');
  if (firstLayer !== undefined && (firstLayer <= 0 || firstLayer > context.nozzleDiameter)) error('initial_layer_print_height', 'Initial layer height must be positive and no greater than the nozzle diameter.');
  for (const key of ['nozzle_temperature', 'nozzle_temperature_initial_layer']) {
    const value = number(config, key);
    if (value !== undefined && (value < context.nozzleTemperature[0] || value > context.nozzleTemperature[1])) error(key, 'Temperature is outside the selected material safe range.');
  }
  const bedKey = selectedBedTemperatureKey(config);
  if (bedKey) for (const key of [bedKey, `${bedKey}_initial_layer`]) {
    const native = config[key]; const value = native ? Number(Array.isArray(native) ? native[0] : native) : undefined;
    if (value !== undefined && (value < context.bedTemperature[0] || value > context.bedTemperature[1])) error(key, 'Temperature is outside the selected bed safe range.');
  }
  for (const key of ['outer_wall_speed', 'inner_wall_speed', 'sparse_infill_speed', 'travel_speed', 'initial_layer_speed']) {
    const value = number(config, key); if (value !== undefined && value > context.maxSpeed) error(key, 'Speed exceeds the selected printer safe limit.');
  }
  const relative = config.use_relative_e_distances !== '0';
  const beforeReset = hasReset(config.before_layer_change_gcode); const layerReset = hasReset(config.layer_change_gcode);
  if (!relative && (beforeReset || layerReset)) error(beforeReset ? 'before_layer_change_gcode' : 'layer_change_gcode', 'Absolute extrusion cannot use a layer G92 E0 reset.');
  const flavor = config.gcode_flavor;
  if (relative && !context.isBambu && (flavor === 'marlin' || flavor === 'marlin2') && !beforeReset && !layerReset)
    error('layer_change_gcode', 'Relative Marlin extrusion requires an uppercase G92 E0 layer reset.');
  return issues;
}

export function hasBlockingIssues(issues: readonly ValidationIssue[]): boolean { return issues.some(issue => issue.severity === 'error'); }
