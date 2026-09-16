import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCatalogIndex, searchPrinters } from './index-client';
import { mergePackSelection } from './merge';
import { loadPrinterPack } from './pack-client';
import type { CatalogIndex, PrinterPack } from './types';

beforeAll(() => Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }));

const pack: PrinterPack = {
  schema: 1, id: 'p1', vendor: 'Acme', model: 'Printer', nozzle: 0.4,
  machine: { speed: '40', shared: 'machine' },
  processes: [{ id: 'standard', name: 'Standard', ladder: 'standard', layerHeight: 0.2, settings: { shared: 'process', layer_height: '0.2' } }],
  filaments: [{ id: 'pla', name: 'Generic PLA', type: 'PLA', settings: { shared: 'filament', nozzle_temperature: ['210'] } }],
  combos: [['standard', 'pla']], meta: { source: 'fixture' },
};

async function digest(bytes: Uint8Array) {
  const hash = await webcrypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

describe('catalog clients', () => {
  it('searches only the index and never fetches a printer pack', async () => {
    const index: CatalogIndex = { schema: 1, orcaTag: 'v2.4.2', engineRelease: 'test', vendors: [{ id: 'acme', name: 'Acme', models: [{ id: 'p1', name: 'Printer', nozzle: 0.4, pack: 'p1.json', bytes: 2, sha256: '00'.repeat(32) }] }] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(index)));
    const loaded = await loadCatalogIndex('/catalog/index.json', fetcher);
    expect(searchPrinters(loaded, 'print')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('merges machine then process then filament then settings ids', () => {
    expect(mergePackSelection(pack, 'standard', 'pla')).toEqual({
      speed: '40', shared: 'filament', layer_height: '0.2', nozzle_temperature: ['210'],
      printer_settings_id: 'p1', print_settings_id: 'standard', filament_settings_id: ['pla'],
    });
  });

  for (const [name, body, schema] of [
    ['SHA mismatch', JSON.stringify(pack), 1],
    ['truncated JSON', '{"schema":1', 1],
    ['unknown schema', JSON.stringify({ ...pack, schema: 2 }), 2],
  ] as const) {
    it(`rejects ${name} and evicts the corrupt cache entry`, async () => {
      const bytes = new TextEncoder().encode(body);
      const sha256 = name === 'SHA mismatch' ? '00'.repeat(32) : await digest(bytes);
      const evict = vi.fn(async () => undefined);
      await expect(loadPrinterPack({ url: '/pack.json', bytes: bytes.byteLength, sha256 },
        vi.fn(async () => new Response(bytes)), evict)).rejects.toThrow();
      expect(evict).toHaveBeenCalledWith('/pack.json');
      expect(schema).toBeGreaterThan(0);
    });
  }
});
