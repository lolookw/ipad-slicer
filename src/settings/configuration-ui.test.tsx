import { render } from 'solid-js/web';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CatalogPickers } from '../catalog/components/CatalogPickers';
import type { CatalogIndex, PrinterPack } from '../catalog/types';
import { SettingsPanels, type SettingsLabels } from './components/SettingsPanels';
import { configuration, flow, resetConfiguration } from '../app/stores';
import { App } from '../app/App';

const pack: PrinterPack = {
  schema: 1, id: 'printer', vendor: 'Acme', model: 'One', nozzle: 0.4,
  machine: { nozzle_diameter: ['0.4'], printable_height: '250', gcode_flavor: 'marlin', use_relative_e_distances: '0' },
  processes: [{ id: 'standard', name: 'Standard', ladder: 'standard', layerHeight: 0.2, settings: { layer_height: '0.2', initial_layer_print_height: '0.2', sparse_infill_density: '20%', enable_support: '1', support_type: 'tree(auto)', brim_type: 'outer_only', brim_width: '5' } }],
  filaments: [{ id: 'pla', name: 'PLA', type: 'PLA', settings: { nozzle_temperature: ['210'] } }], combos: [['standard', 'pla']], meta: {},
};
const index: CatalogIndex = { schema: 2, orcaTag: 'v2.4.2', engineRelease: 'test', vendors: [{ id: 'acme', name: 'Acme', models: [{ id: 'printer', name: 'One', nozzle: 0.4, pack: 'one.json', bytes: 1, sha256: '0'.repeat(64), curated: true }] }] };
const pickerLabels = { search: 'Search', printer: 'Printer', filament: 'Filament', quality: 'Quality', loading: 'Loading', unavailable: 'Not tested', recommended: 'Recommended', verified: 'Verified to slice', noResults: 'No matches', draft: 'Draft', standard: 'Standard', fine: 'Fine' };
const labels: SettingsLabels = {
  mode: 'Settings mode',
  modeSimple: 'Simple', modeAdvanced: 'Advanced', infill: 'Infill', supports: 'Supports', supportType: 'Support type', brimType: 'Brim type', brimWidth: 'Brim width', arrange: 'Arrange', estimates: 'Estimates', unavailable: 'Unavailable', reset: 'Reset', plateWide: 'Plate-wide',
  categories: { quality: 'Quality', strength: 'Strength', speed: 'Speed', support: 'Support', others: 'Others' }, setting: key => key,
  optionLabel: (_key, value) => value,
};

let host: HTMLDivElement; let dispose: (() => void) | undefined;
beforeEach(() => { resetConfiguration(); flow.hasModel.set(false); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { vi.useRealTimers(); dispose?.(); host.remove(); vi.restoreAllMocks(); });

it('keeps catalog pickers presentational and marks unavailable quality rungs', () => {
  const fetcher = vi.spyOn(globalThis, 'fetch'); const onPrinter = vi.fn();
  dispose = render(() => <CatalogPickers index={index} pack={pack} loading={false} filamentId="pla" labels={pickerLabels} onPrinter={onPrinter} onFilament={() => undefined} onQuality={() => undefined} />, host);
  expect(fetcher).not.toHaveBeenCalled();
  expect([...host.querySelectorAll('fieldset button')].map(button => (button as HTMLButtonElement).disabled)).toEqual([true, false, true]);
  const printer = host.querySelector<HTMLSelectElement>('select[aria-label="Printer"]')!; printer.value = 'printer'; printer.dispatchEvent(new Event('change', { bubbles: true }));
  expect(onPrinter).toHaveBeenCalledWith('printer');
});

it('searches with a debounce, pins curated printers and labels generated ones as verified', async () => {
  vi.useFakeTimers();
  const many: CatalogIndex = { ...index, vendors: [
    { id: 'acme', name: 'Acme', models: [{ ...index.vendors[0]!.models[0]! }, { id: 'gen', name: 'Generated One', nozzle: 0.4, pack: 'g.json', bytes: 1, sha256: '0'.repeat(64), curated: false }] },
    { id: 'beta', name: 'Beta', models: [{ id: 'gen2', name: 'Other', nozzle: 0.4, pack: 'g2.json', bytes: 1, sha256: '0'.repeat(64), curated: false }] }] };
  dispose = render(() => <CatalogPickers index={many} loading={false} labels={pickerLabels} onPrinter={() => undefined} onFilament={() => undefined} onQuality={() => undefined} />, host);
  const groups = () => [...host.querySelectorAll('select[aria-label="Printer"] optgroup')].map(group => [group.getAttribute('label'), [...group.querySelectorAll('option')].map(option => option.value)]);
  expect(groups()).toEqual([['Recommended', ['printer']], ['Acme · Verified to slice', ['gen']], ['Beta · Verified to slice', ['gen2']]]);
  const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  search.value = 'BETA'; search.dispatchEvent(new Event('input', { bubbles: true }));
  expect(groups()).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(200);
  expect(groups()).toEqual([['Beta · Verified to slice', ['gen2']]]);
  search.value = 'zzz'; search.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(200);
  expect(host.querySelector('[role="status"]')?.textContent).toBe('No matches');
  vi.useRealTimers();
});

it('bounds the fully expanded simple surface at nine entries and preserves advanced overrides', () => {
  configuration.overrides.set({ outer_wall_speed: 60 });
  dispose = render(() => <div><CatalogPickers index={index} pack={pack} printerId="printer" filamentId="pla" processId="standard" loading={false} labels={pickerLabels} onPrinter={() => undefined} onFilament={() => undefined} onQuality={() => undefined} />
    <SettingsPanels mode={configuration.mode.get()} values={{ ...pack.processes[0]!.settings }} overrides={configuration.overrides.get()} labels={labels} onMode={configuration.mode.set} onChange={(key, value) => configuration.setOverride(key, value)} onReset={key => configuration.resetOverride(key)} onArrange={() => undefined} /></div>, host);
  expect(host.querySelectorAll('[data-simple-entry]')).toHaveLength(9);
  host.querySelectorAll<HTMLButtonElement>('.mode-switch button')[1]!.click();
  host.querySelectorAll<HTMLButtonElement>('.mode-switch button')[0]!.click();
  expect(configuration.overrides.get().outer_wall_speed).toBe(60);
  expect(host.textContent).toContain('Plate-wide');
  expect(host.textContent).not.toContain('Per-object');
});

it('blocks Slice for missing or invalid input and enables it for a valid complete configuration', () => {
  dispose = render(() => <App />, host);
  const slice = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Slice')!;
  expect(slice().disabled).toBe(true);
  flow.hasModel.set(true); configuration.pack.set(pack); configuration.printerId.set('printer'); configuration.filamentId.set('pla'); configuration.processId.set('standard');
  expect(slice().disabled).toBe(false);
  configuration.setOverride('brim_width', 101);
  expect(slice().disabled).toBe(true);
});
