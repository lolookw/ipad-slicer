import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { PrinterPack } from '../catalog/types';
import { decodeNative, encodeNative } from './codec';
import { availableQualityLadder, selectQuality } from './ladder';
import { mergeResolvedSettings, resetOverride } from './merge';
import { BRIM_TYPES, FUZZY_SKINS, GCODE_FLAVORS, IRONING_TYPES, SEAM_POSITIONS, SETTINGS, SUPPORT_TYPES } from './schema';
import { validateSettings } from './validate';
import { setAdhesion, setBedTemperature } from './virtual';

const context = { nozzleDiameter: 0.4, nozzleTemperature: [180, 260] as const, bedTemperature: [0, 110] as const, maxSpeed: 300 };

describe('pinned settings schema', () => {
  it('pins exact support/brim enums and localized label keys', () => {
    expect(SUPPORT_TYPES).toEqual(['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)']);
    expect(BRIM_TYPES).toEqual(['auto_brim', 'brim_ears', 'painted', 'outer_only', 'inner_only', 'outer_and_inner', 'no_brim']);
    expect(GCODE_FLAVORS).toEqual(['marlin', 'klipper', 'reprapfirmware', 'repetier', 'marlin2']);
    expect(IRONING_TYPES).toEqual(['no ironing', 'top', 'topmost', 'solid']);
    expect(SEAM_POSITIONS).toEqual(['nearest', 'aligned', 'aligned_back', 'back', 'random']);
    expect(FUZZY_SKINS).toEqual(['none', 'external', 'hole', 'all', 'allwalls', 'disabled_fuzzy']);
    for (const definition of Object.values(SETTINGS)) {
      const label = definition.labelKey.split('.')[1]! as keyof typeof en.settings;
      expect(en.settings[label]).toBeTruthy();
      expect(es.settings[label]).toBeTruthy();
    }
  });

  it('encodes Orca scalars, percentages, booleans, and vectors', () => {
    expect(encodeNative(SETTINGS.sparse_infill_density, 40)).toBe('40%');
    expect(encodeNative(SETTINGS.enable_support, true)).toBe('1');
    expect(encodeNative(SETTINGS.nozzle_temperature, 210)).toEqual(['210']);
    expect(decodeNative(SETTINGS.nozzle_temperature, ['210'])).toEqual([210]);
  });
});

describe('settings assembly and validation', () => {
  const base = { brim_width: '5', mystery_native_key: 'kept', adaptive_layer_height: '0', nozzle_diameter: ['0.4'] };

  it('keeps resolved values and unknown native keys while excluding obsolete adaptive height', () => {
    const overrides = resetOverride({ brim_width: 12 }, 'brim_width');
    expect(mergeResolvedSettings(base, overrides)).toEqual({ brim_width: '5', mystery_native_key: 'kept', nozzle_diameter: ['0.4'] });
  });

  it('maps virtual bed temperature twins and adhesion settings', () => {
    const bed = setBedTemperature({ curr_bed_type: 'Textured PEI Plate' }, 65);
    expect(bed).toMatchObject({ textured_plate_temp: ['65'], textured_plate_temp_initial_layer: ['65'] });
    expect(setAdhesion({}, 'no_brim', 0)).toMatchObject({ brim_type: 'no_brim', brim_width: '0' });
  });

  it('rejects closed enums, safe limits, layer/nozzle conflicts, and invalid absolute-E macros', () => {
    const invalid = {
      sparse_infill_pattern: 'banana', support_type: 'tree', brim_width: '101',
      layer_height: '0.5', initial_layer_print_height: '0.5', nozzle_temperature: ['270'],
      curr_bed_type: 'Textured PEI Plate', textured_plate_temp: ['120'], travel_speed: '301',
      use_relative_e_distances: '0', before_layer_change_gcode: 'G92 E0',
    };
    const keys = validateSettings(invalid, context).filter(issue => issue.severity === 'error').map(issue => issue.key);
    expect(keys).toEqual(expect.arrayContaining(['sparse_infill_pattern', 'support_type', 'brim_width', 'layer_height', 'initial_layer_print_height', 'nozzle_temperature', 'textured_plate_temp', 'travel_speed', 'before_layer_change_gcode']));
  });

  it('accepts inclusive infill and brim boundaries', () => {
    expect(validateSettings({ sparse_infill_density: '0%', brim_width: '100' }, context)).toEqual([]);
  });
});

describe('quality ladder', () => {
  const pack = {
    schema: 1, id: 'printer', vendor: 'Acme', model: 'One', nozzle: 0.4, machine: {},
    processes: [
      { id: 'draft', name: 'Draft', ladder: 'draft', layerHeight: 0.28, settings: {} },
      { id: 'fine', name: 'Fine', ladder: 'fine', layerHeight: 0.12, settings: {} },
    ],
    filaments: [{ id: 'pla', name: 'PLA', type: 'PLA', settings: {} }],
    combos: [['draft', 'pla']], meta: {},
  } satisfies PrinterPack;

  it('offers only shipped smoke-tested process/filament combinations', () => {
    expect(availableQualityLadder(pack, 'pla')).toEqual({ draft: 'draft' });
    expect(() => selectQuality(pack, 'pla', 'fine')).toThrow(/unavailable/i);
  });
});
