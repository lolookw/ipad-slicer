import type { TierDecision } from '../app/tier/decide';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { putMeshBuffers } from './geometry-cache';
import { importStlFile, type ImportStlResult } from './mesh.worker';
import { IDENTITY_TRANSFORM } from './transforms';

export type ImportLimits = TierDecision['limits'];
export type PlateImportResult = { ok: true; id: string } | { ok: false; error: string };

export function validateImportBudget(
  currentObjects: number,
  currentTriangles: number,
  importedTriangles: number,
  limits: ImportLimits,
): string | undefined {
  if (currentObjects + 1 > limits.objects) return `This performance tier supports at most ${limits.objects} objects.`;
  if (currentTriangles + importedTriangles > limits.triangles) return `This performance tier supports at most ${limits.triangles.toLocaleString()} triangles.`;
  return undefined;
}

export async function importFileToPlate(
  file: File,
  limits: ImportLimits,
  parse: (file: File) => Promise<ImportStlResult> = importStlFile,
): Promise<PlateImportResult> {
  const result = await parse(file);
  if (!result.ok) return result;
  const currentTriangles = plate.state.objects.reduce((sum, object) => sum + object.triangleCount, 0);
  const budgetError = validateImportBudget(plate.state.objects.length, currentTriangles, result.meshBuffers.triangleCount, limits);
  if (budgetError) return { ok: false, error: budgetError };

  const id = globalThis.crypto.randomUUID();
  putMeshBuffers(id, result.meshBuffers);
  binaries.putMesh(id, file);
  plate.addObject({ id, name: file.name, triangleCount: result.meshBuffers.triangleCount, bounds: result.meshBuffers.bounds, transform: IDENTITY_TRANSFORM });
  flow.hasModel.set(true);
  return { ok: true, id };
}
