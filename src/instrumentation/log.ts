export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LogEntry {
  ts: number;
  type: string;
  data?: unknown;
}

export interface LogOptions {
  storage?: StorageLike;
  key?: string;
  capacity?: number;
  now?: () => number;
}

export const LOG_STORAGE_KEY = 'ipad-slicer:log';
export const LEGACY_LOG_STORAGE_KEY = 'ipad-slicer:spike-log';

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Browser privacy settings can deny access to localStorage itself.
    return undefined;
  }
}

function isEntry(value: unknown): value is LogEntry {
  return typeof value === 'object' && value !== null
    && 'ts' in value && typeof value.ts === 'number' && Number.isFinite(value.ts)
    && 'type' in value && typeof value.type === 'string';
}

export function createLog(options: LogOptions = {}) {
  const storage = options.storage ?? defaultStorage();
  const key = options.key ?? LOG_STORAGE_KEY;
  const capacity = options.capacity ?? 500;
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError('Log capacity must be a positive safe integer');
  }

  let buffer: LogEntry[] = [];
  try {
    let raw = storage?.getItem(key);
    if (options.key === undefined && raw === null) {
      raw = storage?.getItem(LEGACY_LOG_STORAGE_KEY) ?? null;
      if (raw !== null) {
        storage?.setItem(key, raw);
        storage?.removeItem(LEGACY_LOG_STORAGE_KEY);
      }
    }
    const saved: unknown = JSON.parse(raw ?? '[]');
    if (Array.isArray(saved) && saved.every(isEntry)) {
      buffer = saved.slice(-capacity);
    }
  } catch {
    // Unreadable or corrupted storage must not prevent instrumentation.
  }

  return {
    append(type: string, data?: unknown): void {
      buffer.push(data === undefined ? { ts: now(), type } : { ts: now(), type, data });
      if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
      try {
        storage?.setItem(key, JSON.stringify(buffer));
      } catch {
        // Quota or serialization failures leave the in-memory log available.
      }
    },
    entries(): LogEntry[] {
      return buffer.map((entry) => ({ ...entry }));
    },
    clear(): void {
      buffer = [];
      try {
        storage?.removeItem(key);
      } catch {
        // Clearing in memory still works when storage is unavailable.
      }
    },
    exportJson(): string {
      return JSON.stringify(buffer, null, 2);
    },
  };
}

export const diagnosticsLog = createLog();
