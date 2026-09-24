import { describe, expect, it } from 'vitest';
import {
  activeBedTemperatureKey, buildCustomFilament, buildCustomFilamentSettings, customFilamentBaseOptions,
  injectCustomFilaments, nativeNumber, validateCustomFilamentValues, type CustomFilamentValues,
} from './custom-filament';
import type { NativeSettings, PackFilament, PrinterPack } from './types';

// A trimmed but representative slice of the real generic PLA preset shipped in
// public/catalog/custom-base.json: enough fields to prove clone-and-override keeps everything a
// full filament profile needs, never a half-empty settings object.
const PLA_SETTINGS: NativeSettings = {
  filament_type: ['PLA'], filament_vendor: ['Generic'], filament_settings_id: [''],
  nozzle_temperature: ['220'], nozzle_temperature_initial_layer: ['220'],
  nozzle_temperature_range_low: ['190'], nozzle_temperature_range_high: ['240'],
  cool_plate_temp: ['35'], cool_plate_temp_initial_layer: ['35'],
  hot_plate_temp: ['55'], hot_plate_temp_initial_layer: ['55'],
  eng_plate_temp: ['0'], eng_plate_temp_initial_layer: ['0'],
  filament_cost: ['20'], filament_density: ['1.24'], filament_flow_ratio: ['0.98'],
  filament_max_volumetric_speed: ['12'],
};
const ABS_SETTINGS: NativeSettings = { ...PLA_SETTINGS, filament_type: ['ABS'], nozzle_temperature: ['270'], hot_plate_temp: ['90'] };

const PLA: PackFilament = { id: 'pla', name: 'Generic PLA', type: 'PLA', settings: PLA_SETTINGS };
const ABS: PackFilament = { id: 'abs', name: 'Generic ABS', type: 'ABS', settings: ABS_SETTINGS };
const SUPPORT: PackFilament = { id: 'support', name: 'Support material', type: 'PLA', settings: {} };

const VALUES: CustomFilamentValues = {
  name: 'Workshop PETG', baseId: 'pla', nozzleTemperature: 230, nozzleTemperatureInitialLayer: 225,
  bedTemperature: 60, bedTemperatureInitialLayer: 65, costPerKg: 25, density: 1.27,
};

describe('nativeNumber', () => {
  it('decodes a vector-wrapped numeric string', () => {
    expect(nativeNumber(PLA_SETTINGS, 'nozzle_temperature', 0)).toBe(220);
  });
  it('falls back when the key is missing or unparsable', () => {
    expect(nativeNumber(PLA_SETTINGS, 'missing_key', 42)).toBe(42);
    expect(nativeNumber({ x: ['nil'] }, 'x', 7)).toBe(7);
  });
});

describe('activeBedTemperatureKey', () => {
  it('resolves the plate key selected by curr_bed_type', () => {
    expect(activeBedTemperatureKey({ curr_bed_type: 'Textured PEI Plate' })).toBe('textured_plate_temp');
  });
  it('falls back to hot_plate_temp when the machine does not pin a plate', () => {
    expect(activeBedTemperatureKey({})).toBe('hot_plate_temp');
  });
});

describe('customFilamentBaseOptions', () => {
  it('keeps only PLA/PETG/ABS-family filaments and extracts numeric defaults', () => {
    const options = customFilamentBaseOptions([PLA, ABS], 'hot_plate_temp');
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      id: 'pla', name: 'Generic PLA', type: 'PLA',
      nozzleTemperature: 220, nozzleTemperatureInitialLayer: 220,
      bedTemperature: 55, bedTemperatureInitialLayer: 55,
      costPerKg: 20, density: 1.24,
    });
    expect(options[1]).toMatchObject({ id: 'abs', nozzleTemperature: 270, bedTemperature: 90 });
  });
  it('reads a different plate key when a different plate is active', () => {
    const options = customFilamentBaseOptions([PLA], 'cool_plate_temp');
    expect(options[0]).toMatchObject({ bedTemperature: 35, bedTemperatureInitialLayer: 35 });
  });
});

describe('validateCustomFilamentValues', () => {
  it('accepts values within the shared SETTINGS bounds', () => {
    expect(() => validateCustomFilamentValues(VALUES, 'hot_plate_temp')).not.toThrow();
  });
  it('rejects a blank name', () => {
    expect(() => validateCustomFilamentValues({ ...VALUES, name: '  ' }, 'hot_plate_temp')).toThrow();
  });
  it('rejects a nozzle temperature outside the shared 0-1500 bound', () => {
    expect(() => validateCustomFilamentValues({ ...VALUES, nozzleTemperature: -1 }, 'hot_plate_temp')).toThrow(/Nozzle temperature/);
    expect(() => validateCustomFilamentValues({ ...VALUES, nozzleTemperature: 2000 }, 'hot_plate_temp')).toThrow(/Nozzle temperature/);
  });
  it('rejects a bed temperature outside the 0-300 bound of the active plate key', () => {
    expect(() => validateCustomFilamentValues({ ...VALUES, bedTemperature: 999 }, 'hot_plate_temp')).toThrow(/Bed temperature/);
  });
  it('rejects a negative cost or density', () => {
    expect(() => validateCustomFilamentValues({ ...VALUES, costPerKg: -5 }, 'hot_plate_temp')).toThrow(/cost/i);
    expect(() => validateCustomFilamentValues({ ...VALUES, density: -1 }, 'hot_plate_temp')).toThrow(/density/i);
  });
});

describe('buildCustomFilamentSettings', () => {
  it('clones every base field and overrides only the exposed ones', () => {
    const settings = buildCustomFilamentSettings(PLA_SETTINGS, 'hot_plate_temp', VALUES);
    expect(settings.nozzle_temperature).toEqual(['230']);
    expect(settings.nozzle_temperature_initial_layer).toEqual(['225']);
    expect(settings.hot_plate_temp).toEqual(['60']);
    expect(settings.hot_plate_temp_initial_layer).toEqual(['65']);
    expect(settings.filament_cost).toEqual(['25']);
    expect(settings.filament_density).toEqual(['1.27']);
    // Untouched fields stay exactly as the base defined them — never a half-empty settings object.
    expect(settings.filament_flow_ratio).toEqual(['0.98']);
    expect(settings.filament_max_volumetric_speed).toEqual(['12']);
    expect(settings.nozzle_temperature_range_low).toEqual(['190']);
    // A plate this base did not use for cooking (eng_plate_temp = 0 for PLA) is left alone, not forced hot.
    expect(settings.eng_plate_temp).toEqual(['0']);
  });
  it('mutating the result never mutates the base object', () => {
    const settings = buildCustomFilamentSettings(PLA_SETTINGS, 'hot_plate_temp', VALUES);
    (settings.nozzle_temperature as string[])[0] = 'mutated';
    expect(PLA_SETTINGS.nozzle_temperature).toEqual(['220']);
  });
});

describe('buildCustomFilament', () => {
  it('builds a complete PackFilament ready to merge into a pack', () => {
    const filament = buildCustomFilament('custom-1', 'PLA', PLA_SETTINGS, 'hot_plate_temp', VALUES);
    expect(filament).toMatchObject({ id: 'custom-1', name: 'Workshop PETG', type: 'PLA' });
    expect(Object.keys(filament.settings).length).toBeGreaterThanOrEqual(Object.keys(PLA_SETTINGS).length);
  });
});

describe('injectCustomFilaments', () => {
  const pack: PrinterPack = {
    schema: 1, id: 'printer', vendor: 'Acme', model: 'One', nozzle: 0.4, machine: {},
    processes: [{ id: 'draft', name: 'Draft', ladder: 'draft', layerHeight: 0.28, settings: {} },
      { id: 'standard', name: 'Standard', ladder: 'standard', layerHeight: 0.2, settings: {} }],
    filaments: [PLA], combos: [['draft', 'pla'], ['standard', 'pla']], meta: {},
  };

  it('adds the custom filament to every existing process as a new combo', () => {
    const custom = buildCustomFilament('custom-1', 'PLA', PLA_SETTINGS, 'hot_plate_temp', VALUES);
    const injected = injectCustomFilaments(pack, [custom]);
    expect(injected.filaments.map(filament => filament.id)).toEqual(['pla', 'custom-1']);
    expect(injected.combos).toEqual(expect.arrayContaining([['draft', 'custom-1'], ['standard', 'custom-1']]));
    expect(injected.combos).toHaveLength(pack.combos.length + pack.processes.length);
  });
  it('returns the same pack reference when there is nothing to inject', () => {
    expect(injectCustomFilaments(pack, [])).toBe(pack);
  });
  it('never mutates the original pack', () => {
    const custom = buildCustomFilament('custom-1', 'PLA', PLA_SETTINGS, 'hot_plate_temp', VALUES);
    injectCustomFilaments(pack, [custom]);
    expect(pack.filaments).toEqual([PLA]);
    expect(pack.combos).toEqual([['draft', 'pla'], ['standard', 'pla']]);
  });
});

// Guards the "no filaments should ever slip through unnoticed" edge the filter in
// customFilamentBaseOptions relies on: an unexpected/support type is simply excluded, not crashed on.
it('ignores a filament type outside the known base families gracefully', () => {
  const weird: PackFilament = { ...SUPPORT, type: 'PVA' as unknown as PackFilament['type'] };
  expect(customFilamentBaseOptions([weird], 'hot_plate_temp')).toEqual([]);
});
