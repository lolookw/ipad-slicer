/**
 * Pure formatting for the library's `totalTimeMs` print-time estimate (e.g. "2h 14m"). Kept separate
 * from `slice/gcode-parse.ts`'s own duration parsing (seconds → text there is a different direction
 * and a different source of truth; see PreviewPanel's reconciliation comment for why only one of the
 * two numbers is ever shown on a given step).
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes <= 0) return '<1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}
