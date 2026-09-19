import { foldText } from './index-client';
import type { CatalogIndex } from './types';

export interface PrinterEntry { id: string; label: string; curated: boolean }
export interface PrinterGroups {
  /** Curated (hand-tuned) printers, pinned above every vendor group. */
  recommended: PrinterEntry[];
  /** Generated printers grouped by vendor, vendors sorted by name. */
  vendors: { id: string; name: string; models: PrinterEntry[] }[];
  total: number;
}

const byLabel = (a: PrinterEntry, b: PrinterEntry) => a.label.localeCompare(b.label, 'en', { numeric: true });

/** Filters by accent-insensitive substring words; the selected printer always stays listed so the picker keeps its value. */
export function groupPrinters(index: CatalogIndex, query: string, selectedId?: string): PrinterGroups {
  const words = foldText(query.trim()).split(/\s+/).filter(Boolean);
  const recommended: PrinterEntry[] = [];
  const vendors: PrinterGroups['vendors'] = [];
  for (const vendor of [...index.vendors].sort((a, b) => a.name.localeCompare(b.name))) {
    const models: PrinterEntry[] = [];
    for (const model of vendor.models) {
      const label = `${vendor.name} ${model.name} · ${model.nozzle} mm`;
      const haystack = foldText(label);
      if (model.id !== selectedId && !words.every(word => haystack.includes(word))) continue;
      (model.curated ? recommended : models).push({ id: model.id, label, curated: model.curated });
    }
    if (models.length) vendors.push({ id: vendor.id, name: vendor.name, models: models.sort(byLabel) });
  }
  return { recommended: recommended.sort(byLabel), vendors,
    total: recommended.length + vendors.reduce((sum, vendor) => sum + vendor.models.length, 0) };
}
