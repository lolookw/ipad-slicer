export type NativeValue = string | string[];
export type NativeSettings = Record<string, NativeValue>;

export interface PackProcess {
  id: string;
  name: string;
  ladder?: 'draft' | 'standard' | 'fine';
  layerHeight: number;
  settings: NativeSettings;
}

export interface PackFilament {
  id: string;
  name: string;
  type: 'PLA' | 'PETG' | 'ABS';
  settings: NativeSettings;
}

export interface PrinterPack {
  schema: 1;
  id: string;
  vendor: string;
  model: string;
  nozzle: number;
  machine: NativeSettings;
  processes: PackProcess[];
  filaments: PackFilament[];
  combos: [processId: string, filamentId: string][];
  meta: Record<string, unknown>;
}

export interface CatalogModel {
  id: string;
  name: string;
  nozzle: number;
  pack: string;
  bytes: number;
  sha256: string;
  /** Hand-tuned profile set (true) or generated from the Orca profile tree and only smoke-verified (false). */
  curated: boolean;
}

export interface CatalogIndex {
  schema: 2;
  orcaTag: string;
  engineRelease: string;
  vendors: { id: string; name: string; models: CatalogModel[] }[];
}
