import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPresetSource, mergeSelection } from './resolve.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'catalog-resolve-'));
  const indexes = join(root, 'indexes');
  const presets = join(root, 'presets');
  await mkdir(indexes);
  await mkdir(presets);
  await writeFile(join(indexes, 'Acme.json'), JSON.stringify({
    name: 'Acme',
    machine_list: [
      { name: 'base-machine', sub_path: 'machine/base.json' },
      { name: 'Printer', sub_path: 'machine/printer.json' },
    ],
    process_list: [{ name: 'Standard', sub_path: 'process/standard.json' }],
    filament_list: [{ name: 'Generic PLA', sub_path: 'filament/pla.json' }],
  }));
  const files = {
    'Acme__machine__base.json': { name: 'base-machine', type: 'machine', speed: '40' },
    'Acme__machine__printer.json': { name: 'Printer', inherits: 'base-machine', printable_area: ['0x0', '200x0', '200x200', '0x200'] },
    'Acme__process__standard.json': { name: 'Standard', type: 'process', layer_height: '0.2', compatible_printers: ['Printer'] },
    'Acme__filament__pla.json': { name: 'Generic PLA', type: 'filament', filament_type: ['PLA'], compatible_printers_condition: 'printer_notes=~/PLA/' },
  };
  await Promise.all(Object.entries(files).map(([name, value]) => writeFile(join(presets, name), JSON.stringify(value))));
  return createPresetSource({ indexDir: indexes, presetDir: presets });
}

describe('catalog resolver', () => {
  it('resolves inheritance from the pinned vendor index without network access', async () => {
    const source = await fixture();
    const machine = await source.resolve('Acme', 'machine', 'Printer');
    expect(machine.settings).toMatchObject({ speed: '40', printable_area: ['0x0', '200x0', '200x200', '0x200'] });
    expect(machine.meta.chain).toEqual(['base-machine', 'Printer']);
  });

  it('keeps compatibility metadata out of native settings', async () => {
    const source = await fixture();
    const selection = await mergeSelection(source, {
      vendor: 'Acme', machine: 'Printer', process: 'Standard', filament: 'Generic PLA',
    });
    expect(selection.settings).not.toHaveProperty('compatible_printers');
    expect(selection.settings).not.toHaveProperty('compatible_printers_condition');
    expect(selection.meta.process.compatiblePrinters).toEqual(['Printer']);
    expect(selection.meta.filament.compatiblePrintersCondition).toBe('printer_notes=~/PLA/');
  });
});
