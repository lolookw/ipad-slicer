import type { PrinterPack } from '../catalog/types';

export type Quality = 'draft' | 'standard' | 'fine';

export function availableQualityLadder(pack: PrinterPack, filamentId: string): Partial<Record<Quality, string>> {
  const result: Partial<Record<Quality, string>> = {};
  for (const process of pack.processes) {
    if (process.ladder && pack.combos.some(([processId, candidate]) => processId === process.id && candidate === filamentId))
      result[process.ladder] = process.id;
  }
  return result;
}

export function selectQuality(pack: PrinterPack, filamentId: string, quality: Quality) {
  const processId = availableQualityLadder(pack, filamentId)[quality];
  if (!processId) throw new Error(`Quality ${quality} is unavailable for the selected printer and filament`);
  return processId;
}
