import type { NativeSettings } from '../catalog/types';
import { encodeNative } from './codec';
import { isSettingKey, OBSOLETE_SETTINGS, SETTINGS, type SettingKey, type SettingValue } from './schema';

export type SettingsOverrides = Partial<Record<SettingKey, SettingValue>>;

export function mergeResolvedSettings(base: NativeSettings, ...layers: SettingsOverrides[]): NativeSettings {
  const merged: NativeSettings = {};
  for (const [key, value] of Object.entries(base)) if (!OBSOLETE_SETTINGS.has(key)) merged[key] = Array.isArray(value) ? [...value] : value;
  for (const layer of layers) for (const [key, value] of Object.entries(layer)) {
    if (value !== undefined && isSettingKey(key) && !OBSOLETE_SETTINGS.has(key)) merged[key] = encodeNative(SETTINGS[key], value);
  }
  return merged;
}

export function resetOverride<T extends SettingsOverrides>(overrides: T, key: SettingKey): T {
  const next = { ...overrides };
  delete next[key];
  return next;
}
