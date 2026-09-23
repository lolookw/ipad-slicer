// The actual service worker entry point. Bundled standalone (not part of the app's module graph)
// by `vite-sw-plugin.ts`, which injects the constants below and writes the result to `/sw.js`.
// All routing/cache decisions live in the pure, unit-tested `sw-runtime.ts`; this file only wires
// them to the real `self`/`caches`/`fetch` globals, which cannot be exercised by Vitest.
import { activateCleanup, handleRequest, installShellVersioned, shouldHandle, type RouteContext } from './sw-runtime';

declare const __SW_BUILD_ID__: string;
declare const __SW_PRECACHE__: string[];
declare const __SW_KILL_SWITCH__: boolean;

interface SwExtendableEvent { waitUntil(promise: Promise<unknown>): void }
interface SwFetchEvent extends SwExtendableEvent { request: Request; respondWith(response: Promise<Response> | Response): void }
interface SwMessageEvent { data: unknown }
interface SwClient { postMessage(message: unknown): void }

// `self` in a real service worker is a `ServiceWorkerGlobalScope`, whose types (from lib.webworker.d.ts)
// conflict with this project's `lib.dom.d.ts` (both declare a different, incompatible `self`). The rest
// of the codebase's worker files avoid this by only touching APIs common to both scopes; this file needs
// service-worker-only members (`skipWaiting`, `clients`, `registration`), so it declares just those here
// and casts once, instead of changing the shared tsconfig `lib` for every file in the project.
interface ServiceWorkerScope {
  addEventListener(type: 'install' | 'activate', listener: (event: SwExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: SwFetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: SwMessageEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void>; matchAll(): Promise<SwClient[]> };
  registration: { unregister(): Promise<boolean> };
  location: { origin: string };
}

const scope = self as unknown as ServiceWorkerScope;
const APP_CACHE = `ipad-slicer-app-${__SW_BUILD_ID__}`;
const ENGINE_CACHE = 'ipad-slicer-engine';
const CATALOG_CACHE = 'ipad-slicer-catalog';
const OWN_CACHE_PREFIX = 'ipad-slicer-';

async function clearAllOwnCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(OWN_CACHE_PREFIX)).map((name) => caches.delete(name)));
}

if (__SW_KILL_SWITCH__) {
  // A "kill switch" build (`SW_KILL=1 npm run build`): never precache, clear every cache this app
  // ever created, and unregister so the browser falls back to always hitting the network. Deploy
  // this build, let every open client activate it, then deploy a normal build again.
  scope.addEventListener('install', (event) => { event.waitUntil(scope.skipWaiting()); });
  scope.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      await clearAllOwnCaches();
      await scope.clients.claim();
      await scope.registration.unregister();
      for (const client of await scope.clients.matchAll()) client.postMessage({ type: 'sw-kill' });
    })());
  });
} else {
  const context: RouteContext = {
    caches, fetchImpl: fetch, precacheSet: new Set(__SW_PRECACHE__),
    appCacheName: APP_CACHE, engineCacheName: ENGINE_CACHE, catalogCacheName: CATALOG_CACHE,
  };

  scope.addEventListener('install', (event) => {
    event.waitUntil(installShellVersioned(caches, APP_CACHE, __SW_PRECACHE__, fetch));
  });

  scope.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      // Engine and catalog caches use stable names and content-addressed/immutable URLs as keys,
      // so they are safe to keep across app versions; only superseded app-shell generations are pruned.
      await activateCleanup(caches, new Set([APP_CACHE, ENGINE_CACHE, CATALOG_CACHE]));
      await scope.clients.claim();
    })());
  });

  scope.addEventListener('fetch', (event) => {
    const request = event.request;
    if (!shouldHandle(request, scope.location.origin)) return;
    event.respondWith(handleRequest(context, request, request.mode === 'navigate'));
  });

  scope.addEventListener('message', (event) => {
    const data = event.data;
    if (data && typeof data === 'object' && (data as { type?: unknown }).type === 'skip-waiting') void scope.skipWaiting();
  });
}
