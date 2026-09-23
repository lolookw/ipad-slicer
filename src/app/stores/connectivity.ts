import { createSignal } from 'solid-js';

/**
 * Visible connectivity state (offline-pwa: "Visible Connectivity State"), kept separate from
 * engine/slice error state so the shell can tell a lost network apart from an engine or slice
 * failure. `online` tracks the browser's own connectivity signal; the rest are set by
 * `AppProvider` as the service worker registration and storage-persistence requests resolve.
 */
const [online, setOnline] = createSignal(typeof navigator === 'undefined' ? true : navigator.onLine);
const [updateAvailable, setUpdateAvailable] = createSignal(false);
const [persisted, setPersisted] = createSignal(false);

export const connectivity = { online, setOnline, updateAvailable, setUpdateAvailable, persisted, setPersisted };

/** Wires `window` online/offline events to the store. Returns an unsubscribe function. */
export function bindConnectivityEvents(target: typeof window | undefined = typeof window === 'undefined' ? undefined : window): () => void {
  if (!target) return () => undefined;
  const goOnline = () => setOnline(true);
  const goOffline = () => setOnline(false);
  target.addEventListener('online', goOnline);
  target.addEventListener('offline', goOffline);
  return () => {
    target.removeEventListener('online', goOnline);
    target.removeEventListener('offline', goOffline);
  };
}
