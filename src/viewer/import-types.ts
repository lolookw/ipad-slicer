import type { MeshBuffers } from './geometry-cache';
import type { CodedError } from '../i18n/en';

/**
 * Material information carried by an imported object. Multi-material printing is not
 * implemented yet, but the data model never assumes a single material per object.
 */
export interface ObjectMaterial {
  name?: string;
  /** Display color as `#RRGGBB` (alpha dropped). */
  color?: string;
}

/** One printable object produced by a model file (an STL yields one, a 3MF yields one per build item). */
export interface ImportedObject {
  /** Object name found in the file; the caller falls back to the file name. */
  name?: string;
  meshBuffers: MeshBuffers;
  /** 1-based extruder/filament slot from slicer metadata, when present. */
  extruder?: number;
  materials?: ObjectMaterial[];
}

export type ModelFormat = 'stl' | '3mf';

export type ImportModelResult = { ok: true; format?: ModelFormat; objects: ImportedObject[] } | { ok: false; error: CodedError };
