import type { TranslationKey } from '../i18n';
import type { SettingKey } from './schema';

export type Translate = (key: TranslationKey) => string;

type OptionGroupKey = 'supportType' | 'brimType' | 'infillPattern' | 'bedType' | 'gcodeFlavor' | 'ironingType' | 'seamPosition' | 'fuzzySkin';

// Maps each enum SettingKey to the settings.options.<group> table in en.ts/es.ts that holds
// its display labels. A setting not listed here (a non-enum field, or a future enum field
// that has not been given a label group yet) falls back to the raw value.
const OPTION_GROUP_BY_SETTING: Partial<Record<SettingKey, OptionGroupKey>> = {
  support_type: 'supportType',
  brim_type: 'brimType',
  sparse_infill_pattern: 'infillPattern',
  curr_bed_type: 'bedType',
  gcode_flavor: 'gcodeFlavor',
  ironing_type: 'ironingType',
  seam_position: 'seamPosition',
  fuzzy_skin: 'fuzzySkin',
};

/**
 * Friendly display label for an enum setting's raw value, e.g. 'crosshatch' -> 'Crosshatch'.
 * `translate` is a settings.options.<group>.<value> -> string lookup (normally the app's live
 * i18n translator, so this picks up the current locale automatically). The raw value itself is
 * always the safe fallback: an unmapped setting key, an unmapped value (a newly added enum
 * member with no label yet), or a translator that has nothing for that key never renders
 * blank and never throws — it just shows the raw value verbatim.
 */
export function optionLabel(translate: Translate, settingKey: SettingKey, value: string): string {
  const group = OPTION_GROUP_BY_SETTING[settingKey];
  if (!group) return value;
  const label = translate(`settings.options.${group}.${value}` as TranslationKey);
  return label || value;
}
