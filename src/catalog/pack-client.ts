import type { PrinterPack } from './types';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Evict = (url: string) => Promise<unknown>;

export interface PackReference { url: string; bytes: number; sha256: string }

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function assertPack(value: unknown): asserts value is PrinterPack {
  if (!value || typeof value !== 'object') throw new Error('Printer pack is not an object');
  const pack = value as Partial<PrinterPack>;
  if (pack.schema !== 1) throw new Error(`Unsupported printer pack schema: ${String(pack.schema)}`);
  if (typeof pack.id !== 'string' || !pack.machine || !Array.isArray(pack.processes) ||
      !Array.isArray(pack.filaments) || !Array.isArray(pack.combos)) throw new Error('Invalid printer pack shape');
}

export async function loadPrinterPack(reference: PackReference, fetcher: Fetcher = fetch,
  evict: Evict = async url => {
    if (typeof caches === 'undefined') return;
    await Promise.all((await caches.keys()).map(async name => (await caches.open(name)).delete(url)));
  }) {
  try {
    const response = await fetcher(reference.url);
    if (!response.ok) throw new Error(`Printer pack unavailable (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== reference.bytes) throw new Error('Printer pack length mismatch');
    const actual = hex(await crypto.subtle.digest('SHA-256', bytes));
    if (actual !== reference.sha256) throw new Error('Printer pack SHA-256 mismatch');
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    assertPack(value);
    return value;
  } catch (error) {
    await evict(reference.url);
    throw error instanceof Error ? error : new Error(String(error));
  }
}
