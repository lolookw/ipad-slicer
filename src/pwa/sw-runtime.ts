/**
 * Pure, testable service-worker logic: request routing, isolation-header preservation, and the
 * cache operations `sw.ts` wires to the real `self`/`caches`/`fetch` globals. Nothing here reads
 * a global, so every function is exercised directly with fake `Request`/`Response`/`Cache`
 * objects in `sw-runtime.test.ts`.
 */

export interface CacheLike {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
  keys(): Promise<readonly Request[]>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<readonly string[]>;
  delete(name: string): Promise<boolean>;
}

/**
 * Only a same-origin GET request without a `Range` header is ever served from the cache or
 * routed by this service worker. Everything else (cross-origin, POST, Range requests used for
 * partial WASM/media fetches) must pass through to the network completely untouched: the caller
 * must not call `event.respondWith()` at all when this returns false.
 */
export function shouldHandle(request: Pick<Request, 'method' | 'url' | 'headers'>, origin: string): boolean {
  if (request.method !== 'GET') return false;
  if (request.headers.get('range') !== null) return false;
  try {
    return new URL(request.url).origin === origin;
  } catch {
    return false;
  }
}

const ISOLATION_HEADERS: readonly [string, string][] = [
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Embedder-Policy', 'require-corp'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['X-Content-Type-Options', 'nosniff'],
];

/**
 * Re-applies COOP/COEP/CORP/nosniff on a response before it is cached or handed back to the
 * page, so a cached document or script can never end up serving the app in a state that is not
 * cross-origin isolated even if the original response was somehow missing a header. Never
 * removes or weakens a header the response already had.
 */
export function withIsolationHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of ISOLATION_HEADERS) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export type RouteKind = 'navigate' | 'shell' | 'engine' | 'catalog-pack' | 'preview-lib' | 'passthrough';

/**
 * Classifies an already-`shouldHandle`-approved request. `precacheSet` holds dist-relative paths
 * (no leading slash) from the build's precache manifest.
 */
export function classifyRequest(pathname: string, precacheSet: ReadonlySet<string>, isNavigation: boolean): RouteKind {
  if (isNavigation) return 'navigate';
  const relative = pathname.replace(/^\//, '');
  if (precacheSet.has(relative)) return 'shell';
  if (/^engine\//.test(relative)) return 'engine';
  if (/^catalog\//.test(relative)) return 'catalog-pack';
  if (/^assets\/GcodePreview-[^/]*\.js$/.test(relative)) return 'preview-lib';
  return 'passthrough';
}

/** Installs the versioned shell cache; on any fetch failure the partial cache is discarded and the error rethrown, so the caller's `install` event rejects and the previous, complete cache stays in control. */
export async function installShellVersioned(
  cacheStorage: CacheStorageLike,
  cacheName: string,
  urls: readonly string[],
  fetchImpl: typeof fetch,
): Promise<void> {
  const cache = await cacheStorage.open(cacheName);
  try {
    for (const url of urls) {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`Precache fetch failed: ${url} (${response.status})`);
      await cache.put(url, withIsolationHeaders(response));
    }
  } catch (error) {
    await cacheStorage.delete(cacheName);
    throw error;
  }
}

/** Deletes every cache whose name is not in `keep`. Used on `activate`, once the new shell is verified complete. */
export async function activateCleanup(cacheStorage: CacheStorageLike, keep: ReadonlySet<string>): Promise<void> {
  const names = await cacheStorage.keys();
  await Promise.all(names.filter((name) => !keep.has(name)).map((name) => cacheStorage.delete(name)));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Catalog packs are named `<id>.<sha8>.json`. Returns false only when the filename carries a hash and the content does not match it; a non-matching filename shape is not verifiable and is treated as pass (the app-level `pack-client.ts` SHA-256 check remains the authoritative fail-closed gate). */
export async function verifiesPackHash(pathname: string, bytes: ArrayBuffer): Promise<boolean> {
  const match = /\.([a-f0-9]{8})\.json$/.exec(pathname);
  if (!match) return true;
  // Rewrapped in a same-realm Uint8Array: `bytes` may come from a `Response` produced by a
  // different global realm (e.g. jsdom vs. Node's built-in fetch under Vitest), and WebCrypto's
  // BufferSource check can reject a foreign-realm ArrayBuffer passed directly.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return hex(digest).startsWith(match[1]!);
}

export interface RouteContext {
  caches: CacheStorageLike;
  fetchImpl: typeof fetch;
  precacheSet: ReadonlySet<string>;
  appCacheName: string;
  engineCacheName: string;
  catalogCacheName: string;
}

async function cacheFirstThenStore(cache: CacheLike, request: Request, fetchImpl: typeof fetch, verify?: (bytes: ArrayBuffer) => Promise<boolean>): Promise<Response> {
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetchImpl(request);
  if (response.ok) {
    const buffer = await response.clone().arrayBuffer();
    if (!verify || (await verify(buffer))) {
      await cache.put(request, withIsolationHeaders(new Response(buffer, { status: response.status, statusText: response.statusText, headers: response.headers })));
    }
  }
  return response;
}

/**
 * Resolves one already-`shouldHandle`-approved request. Shell files and the lazily-cached
 * preview chunk are served cache-first with the current app-shell cache; engine variants and
 * catalog packs are cache-first with their own long-lived caches; navigations fall back to the
 * cached `index.html`; anything unrecognized passes straight to the network.
 */
export async function handleRequest(context: RouteContext, request: Request, isNavigation: boolean): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const kind = classifyRequest(pathname, context.precacheSet, isNavigation);
  switch (kind) {
    case 'navigate': {
      const cache = await context.caches.open(context.appCacheName);
      const cached = await cache.match(new URL('/index.html', request.url).toString());
      if (cached) return cached;
      return context.fetchImpl(request);
    }
    case 'shell':
    case 'preview-lib': {
      const cache = await context.caches.open(context.appCacheName);
      return cacheFirstThenStore(cache, request, context.fetchImpl);
    }
    case 'engine': {
      const cache = await context.caches.open(context.engineCacheName);
      return cacheFirstThenStore(cache, request, context.fetchImpl);
    }
    case 'catalog-pack': {
      const cache = await context.caches.open(context.catalogCacheName);
      return cacheFirstThenStore(cache, request, context.fetchImpl, (buffer) => verifiesPackHash(pathname, buffer));
    }
    default:
      return context.fetchImpl(request);
  }
}
