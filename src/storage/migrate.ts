import type { NativeSettings } from '../catalog/types';
import { SCHEMA_VERSION } from '../settings/schema';

export interface MigrationResult { overrides: NativeSettings; notices: string[]; schemaVersion: number }

export function migrateOverrides(input: NativeSettings, fromVersion: number): MigrationResult {
  if (!Number.isInteger(fromVersion) || fromVersion < 0 || fromVersion > SCHEMA_VERSION) throw new Error(`Unsupported settings schema ${fromVersion}`);
  const overrides = Object.assign(Object.create(null) as NativeSettings, input);
  const notices: string[] = [];
  for (let version = fromVersion; version < SCHEMA_VERSION; version += 1) {
    if (version === 0) {
      if (overrides.first_layer_height !== undefined) {
        overrides.initial_layer_print_height = overrides.first_layer_height;
        delete overrides.first_layer_height;
        notices.push('Renamed first_layer_height to initial_layer_print_height.');
      }
      if (overrides.adaptive_layer_height !== undefined) {
        delete overrides.adaptive_layer_height;
        notices.push('Removed obsolete adaptive_layer_height.');
      }
    }
  }
  return { overrides, notices, schemaVersion: SCHEMA_VERSION };
}
