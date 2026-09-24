/**
 * Pure helpers that build the extra failure context attached to 'engine-error' diagnostics
 * entries (see AppProvider.tsx's slice/save catch blocks). Kept here, separate from the Solid
 * stores that feed them, so the shaping/redaction logic is unit-testable without a DOM.
 */

export interface StackSanitizeOptions {
  /** Lines kept from the top of the stack. Default 5 — enough to name the failing frame without dumping the whole trace. */
  maxLines?: number;
  /** Hard cap on the joined result, in characters. Default 500. */
  maxLength?: number;
}

// Matches a Windows user-profile segment (`C:\Users\<name>\...`) or a POSIX home directory
// (`/Users/<name>/...`, `/home/<name>/...`) up to and including the trailing separator, so the
// redaction leaves the rest of the path (project-relative dirs, file, line:col) intact.
const WINDOWS_HOME = /[A-Za-z]:\\Users\\[^\\/]+\\/g;
const POSIX_HOME = /\/(?:Users|home)\/[^/]+\//g;

/**
 * Shrinks a caught Error's `.stack` to a short, bounded string safe to persist in the diagnostics
 * log: only the first few frames, and any OS user-profile directory redacted (a stack captured on
 * a real device can otherwise leak the local account name via an absolute source path).
 */
export function sanitizeStack(stack: string | undefined, options: StackSanitizeOptions = {}): string | undefined {
  if (!stack) return undefined;
  const maxLines = options.maxLines ?? 5;
  const maxLength = options.maxLength ?? 500;
  const redacted = stack.replaceAll(WINDOWS_HOME, '~\\').replaceAll(POSIX_HOME, '~/');
  const trimmed = redacted.split('\n').slice(0, maxLines).join('\n');
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

export interface PlateObjectSummary {
  /** Names of the objects on the plate at failure time, capped at `cap` entries. */
  models: string[];
  /** True count of objects on the plate, even when `models` was capped. */
  objectCount: number;
  /** Total triangle count across every object on the plate (cheap: each object already carries its own count). */
  triangleCount: number;
}

/** Summarizes the plate for a diagnostics entry. `cap` bounds the exported name list only. */
export function summarizePlateObjects(objects: readonly { name: string; triangleCount: number }[], cap = 20): PlateObjectSummary {
  return {
    models: objects.slice(0, cap).map(object => object.name),
    objectCount: objects.length,
    triangleCount: objects.reduce((sum, object) => sum + object.triangleCount, 0),
  };
}
