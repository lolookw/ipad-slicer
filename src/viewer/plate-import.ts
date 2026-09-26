import type { TierDecision } from '../app/tier/decide';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { putMeshBuffers } from './geometry-cache';
import type { ImportedObject, ImportModelResult } from './import-types';
import { importModelFile, type ImportOptions, type ImportStlResult } from './mesh.worker';
import type { MeshRepairReport } from './mesh-repair';
import { encodeBinaryStl } from './stl-encode';
import { IDENTITY_TRANSFORM } from './transforms';
import type { CodedError } from '../i18n/en';

export type ImportLimits = TierDecision['limits'];
export type PlateImportResult =
  | { ok: true; id: string; ids: string[]; repairs: { name: string; report: MeshRepairReport }[] }
  | { ok: false; error: CodedError };
/** A parser may return the multi-object result or the legacy single-mesh STL shape. */
export type ModelParser = (file: File, options?: ImportOptions) => Promise<ImportModelResult | ImportStlResult>;

export function validateImportBudget(
  currentObjects: number,
  currentTriangles: number,
  importedTriangles: number,
  limits: ImportLimits,
  importedObjects = 1,
): CodedError | undefined {
  if (currentObjects + importedObjects > limits.objects) return { code: 'tier-limit-objects', values: { limit: limits.objects } };
  if (currentTriangles + importedTriangles > limits.triangles) return { code: 'tier-limit-triangles', values: { limit: limits.triangles } };
  return undefined;
}

function normalize(result: ImportModelResult | ImportStlResult): ImportModelResult {
  if (!result.ok) return result;
  if ('objects' in result) return result;
  return { ok: true, format: 'stl', objects: [{ meshBuffers: result.meshBuffers }] };
}

function objectName(object: ImportedObject, file: File, index: number, total: number): string {
  return object.name ?? (total > 1 ? `${file.name} (${index + 1})` : file.name);
}

/**
 * Parses one model file (STL or 3MF) and adds every object it contains to the plate.
 * The import is all-or-nothing: the tier budget is checked for the whole file before anything is added.
 */
export async function importFileToPlate(
  file: File,
  limits: ImportLimits,
  parse: ModelParser = importModelFile,
): Promise<PlateImportResult> {
  const result = normalize(await parse(file, { maxTriangles: limits.triangles }));
  if (!result.ok) return result;
  const currentTriangles = plate.state.objects.reduce((sum, object) => sum + object.triangleCount, 0);
  const importedTriangles = result.objects.reduce((sum, object) => sum + object.meshBuffers.triangleCount, 0);
  const budgetError = validateImportBudget(plate.state.objects.length, currentTriangles, importedTriangles, limits, result.objects.length);
  if (budgetError) return { ok: false, error: budgetError };

  const ids: string[] = [];
  const repairs: { name: string; report: MeshRepairReport }[] = [];
  result.objects.forEach((object, index) => {
    const id = globalThis.crypto.randomUUID();
    const { meshBuffers } = object;
    putMeshBuffers(id, meshBuffers);
    // The engine consumes STL bytes: an STL keeps its original file, a 3MF object gets its baked geometry re-encoded.
    binaries.putMesh(id, result.format === '3mf' ? encodeBinaryStl(meshBuffers) : file);
    const name = objectName(object, file, index, result.objects.length);
    plate.addObject({
      id, name, triangleCount: meshBuffers.triangleCount,
      bounds: meshBuffers.bounds, transform: IDENTITY_TRANSFORM,
      ...(object.extruder !== undefined ? { extruder: object.extruder } : {}),
      ...(object.materials ? { materials: object.materials } : {}),
    });
    ids.push(id);
    const { repairReport } = object;
    if (repairReport && (repairReport.wasModified || repairReport.holesRemaining > 0)) repairs.push({ name, report: repairReport });
  });
  flow.hasModel.set(true);
  return { ok: true, id: ids[0]!, ids, repairs };
}
