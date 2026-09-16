import type { NativeSettings } from '../catalog/types';

export type BrimType = 'auto_brim' | 'brim_ears' | 'painted' | 'outer_only' | 'inner_only' | 'outer_and_inner' | 'no_brim';

const BED_KEYS: Record<string, string> = {
  'Cool Plate': 'cool_plate_temp', 'Engineering Plate': 'eng_plate_temp', 'High Temp Plate': 'hot_plate_temp',
  'Textured PEI Plate': 'textured_plate_temp', 'Textured Cool Plate': 'textured_cool_plate_temp', 'Supertack Plate': 'supertack_plate_temp',
};

export function selectedBedTemperatureKey(config: NativeSettings): string | undefined {
  const type = config.curr_bed_type;
  return typeof type === 'string' ? BED_KEYS[type] : undefined;
}

export function setBedTemperature(config: NativeSettings, temperature: number): NativeSettings {
  const key = selectedBedTemperatureKey(config);
  if (!key) throw new Error('A supported build plate must be selected before setting its temperature');
  return { ...config, [key]: [String(temperature)], [`${key}_initial_layer`]: [String(temperature)] };
}

export function setAdhesion(config: NativeSettings, type: BrimType, width: number): NativeSettings {
  return { ...config, brim_type: type, brim_width: String(width) };
}
