// Registers the service worker and drives the update lifecycle. The stateful decision of when a
// ready update may actually apply (`createUpdateGate`) and the kill-switch query check
// (`shouldKillSwitch`) are pure and unit-tested directly; the rest of this file is browser-API
// wiring that is instead exercised by `tests/e2e/shell.spec.ts`.

export const SW_KILL_QUERY_KEY = 'sw-kill';
export const OWN_CACHE_PREFIX = 'ipad-slicer-';

/** A `?sw-kill=1` query parameter is a manual, no-redeploy-needed escape hatch: it unregisters any
 * service worker and clears this app's caches on the next load, without registering a new one. */
export function shouldKillSwitch(search: string): boolean {
  return new URLSearchParams(search).get(SW_KILL_QUERY_KEY) === '1';
}

export type ApplyResult = 'apply' | 'deferred';

/**
 * Defers applying a ready update while the engine is busy — including a soft-canceled
 * single-thread slice that is still finishing on its own queue — and applies it automatically
 * the moment the engine goes idle again, matching "Defer a ready update" in the offline-pwa spec.
 */
export function createUpdateGate(isBusy: () => boolean) {
  let pending = false;
  return {
    /** Call when the user accepts the update toast. */
    requestApply(): ApplyResult {
      if (isBusy()) { pending = true; return 'deferred'; }
      return 'apply';
    },
    /** Call whenever busy state may have changed (e.g. a slice finished). Returns true exactly
     * once, the moment a previously deferred apply should now run. */
    checkIdle(): boolean {
      if (pending && !isBusy()) { pending = false; return true; }
      return false;
    },
    isPending(): boolean { return pending; },
  };
}

export interface RegisterOptions {
  onUpdateAvailable(): void;
  isBusy(): boolean;
  scope?: string;
  url?: string;
}

export interface RegistrationHandle {
  /** Checks for a new version now (call on launch and on visibility change). */
  checkForUpdate(): void;
  /** Call when the user accepts the update toast; applies immediately or defers while busy. */
  applyUpdate(): void;
  /** Call whenever busy state may have changed; applies a deferred update once idle. */
  notifyIdle(): void;
  readonly gate: ReturnType<typeof createUpdateGate>;
}

async function unregisterAndClearOwnCaches(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if (typeof caches !== 'undefined') {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(OWN_CACHE_PREFIX)).map((name) => caches.delete(name)));
  }
}

function postSkipWaiting(worker: ServiceWorker | null): void {
  worker?.postMessage({ type: 'skip-waiting' });
}

/**
 * Registers `/sw.js`, checks for updates on launch and on visibility change, and reports a ready
 * update via `onUpdateAvailable` (a dismissible toast shows it; see `UpdateToast.tsx`). Returns
 * `undefined` when service workers are unsupported, or when a `?sw-kill=1` kill switch was found
 * (it unregisters and clears caches instead of registering).
 */
export async function registerServiceWorker(options: RegisterOptions): Promise<RegistrationHandle | undefined> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined;
  if (typeof location !== 'undefined' && shouldKillSwitch(location.search)) {
    await unregisterAndClearOwnCaches();
    return undefined;
  }

  const registration = await navigator.serviceWorker.register(options.url ?? '/sw.js', { scope: options.scope ?? '/' });
  const gate = createUpdateGate(options.isBusy);

  // `controllerchange` fires both when a waiting worker we told to skip-waiting takes over AND
  // the first time any service worker ever claims this page (via `clients.claim()` on its very
  // first activation). Reloading unconditionally would reload every fresh visit; only the former
  // should reload, so this only arms right before `postSkipWaiting()` runs.
  let expectingReload = false;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!expectingReload || reloaded) return;
    reloaded = true;
    location.reload();
  });
  const applyAndArm = () => {
    expectingReload = true;
    postSkipWaiting(registration.waiting);
  };

  registration.addEventListener('updatefound', () => {
    // `updatefound` also fires for this page's very first install (there is simply no previous
    // controller to update from yet). Whether `navigator.serviceWorker.controller` is set by the
    // time the new worker finishes installing is not a reliable signal on its own — snapshot it
    // here, when the update was first observed, so a controller that appears later (this
    // registration's own first activation completing) cannot be mistaken for "there was already a
    // version running, and a newer one just finished installing".
    const wasAlreadyControlled = Boolean(navigator.serviceWorker.controller);
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && wasAlreadyControlled) options.onUpdateAvailable();
    });
  });
  if (registration.waiting && navigator.serviceWorker.controller) options.onUpdateAvailable();

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update();
    });
  }
  void registration.update();

  return {
    checkForUpdate() { void registration.update(); },
    applyUpdate() {
      if (gate.requestApply() === 'apply') applyAndArm();
    },
    notifyIdle() {
      if (gate.checkIdle()) applyAndArm();
    },
    gate,
  };
}

/** Feature-detected, no-op if unsupported. Call once after the first successful save or install. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
