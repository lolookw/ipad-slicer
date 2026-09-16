import { beforeEach, expect, it } from 'vitest';
import { validateSettings } from '../../settings/validate';
import type { PrinterPack } from '../../catalog/types';
import { configuration, validationContext } from './configuration';

// Regression test for the "wrong filament's safe bounds" bug: validationContext(pack) used to read
// configuration.filamentId.get() unconditionally, so a caller validating a SPECIFIC profile (an
// imported preset, a custom-printer draft) got the LIVE UI's filament bounds instead — or, if
// nothing was selected yet, a wide generic fallback that let an unsafe temperature through.

const pack: PrinterPack = {
  schema: 1, id: 'printer', vendor: 'Test', model: 'Test Printer', nozzle: 0.4, machine: {}, processes: [], combos: [],
  meta: {},
  filaments: [
    { id: 'pla', name: 'PLA', type: 'PLA', settings: { nozzle_temperature_range_low: '190', nozzle_temperature_range_high: '220' } },
    { id: 'abs', name: 'ABS', type: 'ABS', settings: { nozzle_temperature_range_low: '230', nozzle_temperature_range_high: '260' } },
  ],
};

beforeEach(() => {
  configuration.filamentId.set(undefined);
});

it('uses the explicitly passed filament, not the live selection', () => {
  configuration.filamentId.set('abs');
  expect(validationContext(pack, 'pla').nozzleTemperature).toEqual([190, 220]);
});

it('falls back to the live selection only when no filament id is passed', () => {
  configuration.filamentId.set('abs');
  expect(validationContext(pack).nozzleTemperature).toEqual([230, 260]);
});

it('rejects a PLA-unsafe temperature when validating an explicit PLA profile, even with no live selection', () => {
  // This is exactly the import scenario: nothing is selected in the UI yet (filamentId is
  // undefined), but the preset being validated names its own filament explicitly.
  expect(configuration.filamentId.get()).toBeUndefined();
  const issues = validateSettings({ nozzle_temperature: '300' }, validationContext(pack, 'pla'));
  expect(issues).toContainEqual(expect.objectContaining({ key: 'nozzle_temperature', severity: 'error' }));
});

it('previously would have let that same value through via the wide undefined-filament fallback', () => {
  // Documents the bug this test file guards against: the old call site, `validationContext(pack)`
  // with no live selection, resolves no filament and falls back to [150, 320] — 300 is inside that
  // range, so this is what silently passed before the fix.
  const issues = validateSettings({ nozzle_temperature: '300' }, validationContext(pack));
  expect(issues.some(issue => issue.key === 'nozzle_temperature')).toBe(false);
});
