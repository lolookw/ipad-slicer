import type { NativeSettings, NativeValue } from '../catalog/types';
import { isSettingKey, OBSOLETE_SETTINGS, SCHEMA_VERSION } from '../settings/schema';
import type { ValidationIssue } from '../settings/validate';
import type { StoredPreset } from './db';
import { migrateOverrides } from './migrate';

const FORMAT = 'ipad-slicer.presets';
const VERSION = 1;
const MAX_BYTES = 1_048_576;
const MAX_STRING = 65_536;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface ImportRepository { importAtomic(presets: readonly StoredPreset[], activePresetId: string): Promise<void> }
export interface ImportHooks {
  isCompatible(preset: StoredPreset): boolean;
  validate(preset: StoredPreset): readonly ValidationIssue[];
  createId?: () => string;
}
export interface PreparedImport { presets: StoredPreset[]; notices: string[] }

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max = 128): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new Error(`${label} is invalid`);
  return value;
}
function safeParse(input: string): unknown {
  if (new TextEncoder().encode(input).byteLength > MAX_BYTES) throw new Error('Preset file exceeds the 1 MB limit');
  try {
    return JSON.parse(input, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`Forbidden object key ${key}`);
      if (typeof value === 'string' && value.length > MAX_STRING) throw new Error('Preset contains an oversized string or G-code macro');
      if (value && typeof value === 'object' && !Array.isArray(value)) return Object.assign(Object.create(null), value);
      return value;
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error('Preset file is not valid JSON');
  }
}
function nativeValue(value: unknown, key: string): NativeValue {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return [...value];
  throw new Error(`Override ${key} must contain Orca string values`);
}

export function preparePresetImport(input: string, hooks: ImportHooks): PreparedImport {
  const root = record(safeParse(input), 'Preset file');
  if (root.format !== FORMAT || root.version !== VERSION) throw new Error('Unsupported preset format or version');
  if (Number.isNaN(Date.parse(string(root.exportedAt, 'Export timestamp')))) throw new Error('Export timestamp is invalid');
  if (!Array.isArray(root.presets) || root.presets.length === 0 || root.presets.length > 100) throw new Error('Preset file must contain between 1 and 100 presets');
  const notices: string[] = [];
  const createId = hooks.createId ?? (() => globalThis.crypto.randomUUID());
  const presets = root.presets.map((item, index): StoredPreset => {
    const source = record(item, `Preset ${index + 1}`);
    const rawOverrides = record(source.overrides, `Preset ${index + 1} overrides`);
    if (Object.keys(rawOverrides).some(key => OBSOLETE_SETTINGS.has(key))) throw new Error('adaptive_layer_height is obsolete and cannot be imported');
    const allowed = Object.create(null) as NativeSettings;
    for (const [key, value] of Object.entries(rawOverrides)) {
      if (!isSettingKey(key) && key !== 'first_layer_height') { notices.push(`Dropped unknown setting ${key}.`); continue; }
      allowed[key] = nativeValue(value, key);
    }
    const schemaVersion = Number(source.schemaVersion);
    const migrated = migrateOverrides(allowed, schemaVersion);
    notices.push(...migrated.notices);
    const preset: StoredPreset = Object.assign(Object.create(null), {
      id: createId(), name: string(source.name, 'Preset name'),
      kind: source.kind === 'catalog' || source.kind === 'custom' ? source.kind : (() => { throw new Error('Preset kind is invalid'); })(),
      printerId: string(source.printerId, 'Printer id'), baseId: string(source.baseId, 'Base id'),
      processId: string(source.processId, 'Process id'), filamentId: string(source.filamentId, 'Filament id'),
      overrides: migrated.overrides, schemaVersion: migrated.schemaVersion, updatedAt: Date.now(),
    });
    if (!hooks.isCompatible(preset)) throw new Error(`Preset ${preset.name} refers to an unavailable profile`);
    const errors = hooks.validate(preset).filter(issue => issue.severity === 'error');
    if (errors.length) throw new Error(errors.map(issue => `${issue.key}: ${issue.message}`).join('; '));
    return preset;
  });
  return { presets, notices };
}

export async function importPresetBundle(input: string, repository: ImportRepository, hooks: ImportHooks): Promise<PreparedImport> {
  const prepared = preparePresetImport(input, hooks);
  await repository.importAtomic(prepared.presets, prepared.presets[0]!.id);
  return prepared;
}

export function exportPresetBundle(presets: readonly StoredPreset[], now = new Date()): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: now.toISOString(), presets });
}
