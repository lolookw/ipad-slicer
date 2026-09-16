import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog } from './build-catalog.mjs';
import { verifyCatalog } from './verify-catalog.mjs';

const source = { async resolve(_vendor, kind, name) {
  return { settings: kind === 'machine' ? { printable_area: ['0x0', '20x20'] }
    : kind === 'process' ? { layer_height: '0.2', shared: 'process' }
      : { filament_type: ['PLA'], shared: 'filament' },
  meta: { chain: [`base-${kind}`, name], compatiblePrinters: ['Printer'] } };
} };
const config = { orcaTag: 'v2.4.2', engineRelease: 'test', vendors: [{ id: 'acme', name: 'Acme', source: 'Acme', models: [{
  id: 'printer', name: 'Printer', nozzle: 0.4, machine: 'Printer', required: true, fixups: { fixed: '1' },
  processes: [{ id: 'standard', name: 'Standard', ladder: 'standard', preset: 'Standard' }],
  filaments: [{ id: 'pla', name: 'Generic PLA', type: 'PLA', preset: 'Generic PLA' }],
  combos: [['standard', 'pla']],
}] }] };

describe('catalog builder and verifier', () => {
  it('emits deterministic hashed packs with provenance and only passing combinations', async () => {
    const first = await mkdtemp(join(tmpdir(), 'catalog-build-a-'));
    const second = await mkdtemp(join(tmpdir(), 'catalog-build-b-'));
    const passing = new Set(['printer:standard:pla']);
    const a = await buildCatalog(config, passing, { source, outputDir: first });
    const b = await buildCatalog(config, passing, { source, outputDir: second });
    expect(a).toEqual(b);
    const model = a.vendors[0].models[0];
    const pack = JSON.parse(await readFile(join(first, model.pack), 'utf8'));
    expect(pack.meta.machine.chain).toEqual(['base-machine', 'Printer']);
    expect(pack.machine.fixed).toBe('1');
    await expect(verifyCatalog(join(first, 'index.json'))).resolves.toEqual({ printers: 1, combos: 1 });
  });

  it('fails required gaps and corrupted pack hashes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'catalog-build-bad-'));
    await expect(buildCatalog(config, new Set(), { source, outputDir: root })).rejects.toThrow('Required model');
    const index = await buildCatalog(config, new Set(['printer:standard:pla']), { source, outputDir: root });
    await writeFile(join(root, index.vendors[0].models[0].pack), '{}');
    await expect(verifyCatalog(join(root, 'index.json'))).rejects.toThrow('Length mismatch');
  });

  it('emits a smoke-gated custom base without indexing it as certified', async () => {
    const root = await mkdtemp(join(tmpdir(), 'catalog-custom-'));
    const customBase = { id: 'custom', name: 'Custom', source: 'Acme', machine: 'Printer',
      processes: config.vendors[0].models[0].processes,
      filaments: config.vendors[0].models[0].filaments };
    await buildCatalog({ ...config, customBase }, new Set(['printer:standard:pla', 'custom:standard:pla']),
      { source, outputDir: root });
    const custom = JSON.parse(await readFile(join(root, 'custom-base.json'), 'utf8'));
    expect(custom).toMatchObject({ schema: 1, id: 'custom', vendor: 'custom', combos: [['standard', 'pla']] });
  });
});
