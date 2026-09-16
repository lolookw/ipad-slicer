import type { CatalogIndex, CatalogModel } from './types';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isIndex(value: unknown): value is CatalogIndex {
  if (!value || typeof value !== 'object') return false;
  const index = value as Partial<CatalogIndex>;
  return index.schema === 1 && typeof index.orcaTag === 'string' &&
    typeof index.engineRelease === 'string' && Array.isArray(index.vendors) &&
    index.vendors.every(vendor => typeof vendor.id === 'string' && typeof vendor.name === 'string' &&
      Array.isArray(vendor.models) && vendor.models.every(model =>
        typeof model.id === 'string' && typeof model.pack === 'string' && /^[a-f0-9]{64}$/.test(model.sha256)));
}

export async function loadCatalogIndex(url = '/catalog/index.json', fetcher: Fetcher = fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Catalog index unavailable (${response.status})`);
  const value: unknown = await response.json();
  if (!isIndex(value)) throw new Error('Catalog index has an unsupported schema');
  return value;
}

export function searchPrinters(index: CatalogIndex, query: string): CatalogModel[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return index.vendors.flatMap(vendor => vendor.models.map(model => ({ ...model, name: `${vendor.name} ${model.name}` })))
    .filter(model => words.every(word => `${model.name} ${model.nozzle}`.toLocaleLowerCase().includes(word)));
}
