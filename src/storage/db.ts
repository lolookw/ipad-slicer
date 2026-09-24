import type { NativeSettings, PackFilament } from '../catalog/types';

export const DB_NAME = 'ipad-slicer';
export const DB_VERSION = 2;

export interface StoredPreset {
  id: string;
  name: string;
  kind: 'catalog' | 'custom';
  printerId: string;
  baseId: string;
  processId: string;
  filamentId: string;
  overrides: NativeSettings;
  schemaVersion: number;
  updatedAt: number;
}
export interface StoredCustomPrinter { id: string; name: string; baseId: 'custom'; settings: NativeSettings; updatedAt: number }
/** A user-defined filament, persisted independently of any one printer (like the generic catalog
 * filaments it is cloned from, it is reusable across whichever pack is currently selected). */
export interface StoredCustomFilament { id: string; name: string; type: PackFilament['type']; settings: NativeSettings; updatedAt: number }
export interface UiRecord { key: string; value: unknown }

export function openSettingsDatabase(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      switch ((event as IDBVersionChangeEvent).oldVersion) {
        case 0:
          db.createObjectStore('presets', { keyPath: 'id' });
          db.createObjectStore('printers', { keyPath: 'id' });
          db.createObjectStore('ui', { keyPath: 'key' });
        case 1:
          db.createObjectStore('filaments', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open settings database'));
    request.onblocked = () => reject(new Error('Settings database upgrade is blocked by another tab'));
  });
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}
