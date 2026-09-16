import type { NativeSettings, PrinterPack } from './types';

export function mergePackSelection(pack: PrinterPack, processId: string, filamentId: string): NativeSettings {
  if (!pack.combos.some(([process, filament]) => process === processId && filament === filamentId))
    throw new Error('The selected process and filament combination was not smoke-tested');
  const process = pack.processes.find(candidate => candidate.id === processId);
  const filament = pack.filaments.find(candidate => candidate.id === filamentId);
  if (!process || !filament) throw new Error('The selected catalog entry is missing');
  return {
    ...pack.machine, ...process.settings, ...filament.settings,
    printer_settings_id: pack.id,
    print_settings_id: process.id,
    filament_settings_id: [filament.id],
  };
}
