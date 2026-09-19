import { describe, expect, it } from 'vitest';
import { mergeConfigs } from './config.mjs';
import { displayName, modelId, pickFilaments, pickMachine, pickProcesses } from './generate-config.mjs';

describe('generated catalog selection', () => {
  it('picks the 0.4 nozzle machine for a model and skips models without one', () => {
    const machines = ['Acme X 0.2 nozzle', 'Acme X 0.4 nozzle', 'Acme Y (0.4 nozzle)', 'Acme Z 0.6 nozzle', 'Acme XL 0.4 nozzle'];
    expect(pickMachine('Acme X', machines)).toBe('Acme X 0.4 nozzle');
    expect(pickMachine('Acme Y', machines)).toBe('Acme Y (0.4 nozzle)');
    expect(pickMachine('Acme Z', machines)).toBeUndefined();
  });

  it('picks one process per ladder rung by layer height with keyword tie-breaks', () => {
    const picked = pickProcesses([
      { name: '0.20mm Strength', layerHeight: 0.2 }, { name: '0.20mm Standard', layerHeight: 0.2 },
      { name: '0.16mm Optimal', layerHeight: 0.16 }, { name: '0.12mm Fine', layerHeight: 0.12 },
      { name: '0.28mm Extra Draft', layerHeight: 0.28 }, { name: '0.24mm Draft', layerHeight: 0.24 },
      { name: '0.08mm Extra Fine', layerHeight: 0.08 }, { name: '0.32mm Chunky', layerHeight: 0.32 },
    ]);
    expect(picked).toEqual({ fine: '0.12mm Fine', standard: '0.20mm Standard', draft: '0.24mm Draft' });
  });

  it('requires a standard process but tolerates missing fine or draft rungs', () => {
    expect(pickProcesses([{ name: '0.12mm Fine', layerHeight: 0.12 }])).toBeUndefined();
    expect(pickProcesses([{ name: '0.20mm Standard', layerHeight: 0.2 }])).toEqual({ standard: '0.20mm Standard' });
  });

  it('prefers plain generic filaments and requires PLA', () => {
    const picked = pickFilaments([
      { name: 'Generic PLA Silk', type: 'PLA' }, { name: 'Generic PLA', type: 'PLA' },
      { name: 'Generic PETG', type: 'PETG' }, { name: 'Generic ABS', type: 'ABS' }, { name: 'Generic PA', type: 'PA' },
    ]);
    expect(picked).toEqual({ PLA: 'Generic PLA', PETG: 'Generic PETG', ABS: 'Generic ABS' });
    expect(pickFilaments([{ name: 'Generic PETG', type: 'PETG' }])).toBeUndefined();
  });

  it('derives stable ids and vendor-free display names', () => {
    expect(modelId('creality', 'Ender-3 V2 Neo')).toBe('creality-ender-3-v2-neo-04');
    expect(displayName('Bambu Lab', 'Bambu Lab X1 Carbon')).toBe('X1 Carbon');
    expect(displayName('Voron', 'Trident')).toBe('Trident');
  });
});

describe('curated and generated config merge', () => {
  const model = (id, machine) => ({ id, name: id, nozzle: 0.4, machine, processes: [], filaments: [] });
  const curated = { source: { commit: 'x' }, vendors: [{ id: 'acme', name: 'Acme', source: 'Acme', models: [model('a', 'A 0.4')] }] };

  it('lets curated models win on id or machine conflicts and marks provenance', () => {
    const generated = { source: { commit: 'x' }, vendors: [
      { id: 'acme', name: 'Acme', source: 'Acme', models: [model('a', 'other'), model('b', 'A 0.4'), model('c', 'C 0.4')] },
      { id: 'zed', name: 'Zed', source: 'Zed', models: [model('z', 'Z 0.4')] }] };
    const merged = mergeConfigs(curated, generated);
    expect(merged.vendors.map(vendor => vendor.id)).toEqual(['acme', 'zed']);
    expect(merged.vendors[0].models.map(entry => [entry.id, entry.curated, entry.required])).toEqual([['a', true, undefined], ['c', false, false]]);
    expect(merged.vendors[1].models[0]).toMatchObject({ id: 'z', curated: false, required: false });
  });

  it('works without a generated config', () => {
    expect(mergeConfigs(curated, undefined).vendors[0].models[0].curated).toBe(true);
  });
});
