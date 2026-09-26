import { createSignal } from 'solid-js';
import type { CodedError } from '../i18n/en';
import type { MeshRepairReport } from './mesh-repair';
import { importFileToPlate, type ImportLimits, type ModelParser } from './plate-import';

/**
 * Shared import state for every import entry point (the viewer button and the Import step),
 * so both use one code path and report one busy/error/result state.
 */
const [busy, setBusy] = createSignal(false);
const [error, setError] = createSignal<CodedError>();
const [lastImported, setLastImported] = createSignal(0);
const [repairNotices, setRepairNotices] = createSignal<{ name: string; report: MeshRepairReport }[]>([]);

export const importSession = {
  busy,
  error,
  /** Objects added by the most recent import action (0 after a failure or before any import). */
  lastImported,
  /** Objects whose mesh needed automatic repair in the most recent import action, informational only. */
  repairNotices,
  clearError(): void { setError(undefined); },
  reset(): void { setBusy(false); setError(undefined); setLastImported(0); setRepairNotices([]); },
  async importFiles(files: Iterable<File> | null | undefined, limits: ImportLimits, parse?: ModelParser): Promise<number> {
    const list = files ? Array.from(files) : [];
    if (!list.length || busy()) return 0;
    setBusy(true); setError(undefined); setLastImported(0); setRepairNotices([]);
    let added = 0;
    try {
      for (const file of list) {
        const result = await importFileToPlate(file, limits, parse);
        if (!result.ok) { setError(result.error); break; }
        added += result.ids.length;
        if (result.repairs.length) setRepairNotices(notices => [...notices, ...result.repairs]);
      }
    } finally {
      setLastImported(added);
      setBusy(false);
    }
    return added;
  },
};
