import { describe, expect, it, vi } from 'vitest';
import { importPresetBundle, preparePresetImport } from './import-export';
import { migrateOverrides } from './migrate';
import { SCHEMA_VERSION } from '../settings/schema';
import { validateSettings } from '../settings/validate';
import type { StoredPreset } from './db';
import { assertCustomPrinterBase } from './presets-repo';

const valid = {
  format: 'ipad-slicer.presets', version: 1, exportedAt: '2026-09-15T00:00:00.000Z',
  presets: [{ id: 'old-id', name: 'PLA', kind: 'catalog', printerId: 'p1', baseId: 'p1', processId: 'standard', filamentId: 'pla', overrides: { brim_width: '5' }, schemaVersion: SCHEMA_VERSION, updatedAt: 1 }],
};

function text(value: unknown) { return JSON.stringify(value); }

describe('override migrations', () => {
  it('renames historical keys and reports removed obsolete values', () => {
    expect(migrateOverrides({ first_layer_height: '0.2', adaptive_layer_height: '1' }, 0)).toEqual({
      overrides: { initial_layer_print_height: '0.2' },
      notices: ['Renamed first_layer_height to initial_layer_print_height.', 'Removed obsolete adaptive_layer_height.'],
      schemaVersion: SCHEMA_VERSION,
    });
  });
  it('requires custom printers to retain the smoke-tested generic base', () => {
    expect(() => assertCustomPrinterBase({ id: 'p', name: 'P', baseId: 'catalog' as 'custom', settings: {}, updatedAt: 1 })).toThrow(/custom base/i);
  });
});

describe('preset import threat matrix', () => {
  const hooks = {
    isCompatible: (preset: { printerId: string }) => preset.printerId === 'p1',
    validate: () => [],
    createId: () => 'new-id',
  };

  it.each([
    ['not JSON', '{'],
    ['over 1 MB', ' '.repeat(1_048_577)],
    ['wrong format', text({ ...valid, format: 'other' })],
    ['wrong version', text({ ...valid, version: 2 })],
    ['prototype key', '{"format":"ipad-slicer.presets","version":1,"exportedAt":"x","presets":[],"__proto__":{}}'],
    ['constructor key', '{"format":"ipad-slicer.presets","version":1,"exportedAt":"x","presets":[],"constructor":{}}'],
    ['oversized string', text({ ...valid, presets: [{ ...valid.presets[0], name: 'x'.repeat(65_537) }] })],
    ['obsolete setting', text({ ...valid, presets: [{ ...valid.presets[0], overrides: { adaptive_layer_height: '1' } }] })],
  ])('rejects %s without producing an import', (_name, input) => {
    expect(() => preparePresetImport(input, hooks)).toThrow();
  });

  it('drops unknown override keys with notices, uses null-prototype records, and regenerates ids', () => {
    const input = text({ ...valid, presets: [{ ...valid.presets[0], overrides: { brim_width: '5', surprise: 'x' } }] });
    const result = preparePresetImport(input, hooks);
    expect(result.presets[0]).toMatchObject({ id: 'new-id', overrides: { brim_width: '5' } });
    expect(Object.getPrototypeOf(result.presets[0]!.overrides)).toBeNull();
    expect(result.notices).toContain('Dropped unknown setting surprise.');
  });

  it('migrates recognized historical keys before applying the current allow-list', () => {
    const input = text({ ...valid, presets: [{ ...valid.presets[0], schemaVersion: 0, overrides: { first_layer_height: '0.24' } }] });
    expect(preparePresetImport(input, hooks).presets[0]?.overrides).toEqual({ initial_layer_print_height: '0.24' });
  });

  it('rejects unavailable dependencies and validation errors before repository activation', async () => {
    const repository = { importAtomic: vi.fn(async () => undefined) };
    const unavailable = { ...hooks, isCompatible: () => false };
    await expect(importPresetBundle(text(valid), repository, unavailable)).rejects.toThrow(/unavailable/i);
    const unsafe = text({ ...valid, presets: [{ ...valid.presets[0], overrides: { brim_width: '101' } }] });
    const invalid = { ...hooks, validate: (preset: StoredPreset) => validateSettings(preset.overrides, { nozzleDiameter: 0.4, nozzleTemperature: [180, 260], bedTemperature: [0, 110], maxSpeed: 300 }) };
    await expect(importPresetBundle(unsafe, repository, invalid)).rejects.toThrow(/brim_width/);
    expect(repository.importAtomic).not.toHaveBeenCalled();
  });
});
