import { describe, expect, test, vi } from 'vitest';
import {
  activateCleanup, classifyRequest, handleRequest, installShellVersioned, shouldHandle,
  verifiesPackHash, withIsolationHeaders, type CacheLike, type CacheStorageLike, type RouteContext,
} from './sw-runtime';

const ORIGIN = 'https://slicer.example';

class FakeCache implements CacheLike {
  store = new Map<string, Response>();
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const url = typeof request === 'string' ? request : request instanceof URL ? request.toString() : request.url;
    const response = this.store.get(url);
    return response?.clone();
  }
  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const url = typeof request === 'string' ? request : request instanceof URL ? request.toString() : request.url;
    this.store.set(url, response);
  }
  async keys(): Promise<readonly Request[]> {
    return [...this.store.keys()].map((url) => new Request(url));
  }
}

class FakeCacheStorage implements CacheStorageLike {
  caches = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name);
    if (!cache) { cache = new FakeCache(); this.caches.set(name, cache); }
    return cache;
  }
  async keys(): Promise<readonly string[]> { return [...this.caches.keys()]; }
  async delete(name: string): Promise<boolean> { return this.caches.delete(name); }
}

describe('shouldHandle', () => {
  test('handles a same-origin GET without a Range header', () => {
    const request = new Request(`${ORIGIN}/assets/index.js`);
    expect(shouldHandle(request, ORIGIN)).toBe(true);
  });
  test('passes through a cross-origin GET', () => {
    const request = new Request('https://other.example/x.js');
    expect(shouldHandle(request, ORIGIN)).toBe(false);
  });
  test('passes through a POST', () => {
    const request = new Request(`${ORIGIN}/api`, { method: 'POST' });
    expect(shouldHandle(request, ORIGIN)).toBe(false);
  });
  test('passes through a Range request (partial WASM/media fetches)', () => {
    const request = new Request(`${ORIGIN}/engine/v1/st/slicer.wasm.gz.part0`, { headers: { Range: 'bytes=0-100' } });
    expect(shouldHandle(request, ORIGIN)).toBe(false);
  });
});

describe('withIsolationHeaders', () => {
  test('adds COOP/COEP/CORP/nosniff without altering the body or status', async () => {
    const original = new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    const stamped = withIsolationHeaders(original);
    expect(stamped.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(stamped.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(stamped.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(stamped.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(stamped.headers.get('Content-Type')).toBe('text/html');
    expect(await stamped.text()).toBe('<html></html>');
    expect(stamped.status).toBe(200);
  });

  test('never removes a header the response already carried', () => {
    const original = new Response('x', { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cache-Control': 'no-cache' } });
    const stamped = withIsolationHeaders(original);
    expect(stamped.headers.get('Cache-Control')).toBe('no-cache');
    expect(stamped.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
});

describe('classifyRequest', () => {
  const precache = new Set(['index.html', 'assets/index-abc.js', 'catalog/index.json', 'catalog/custom-base.json']);
  test('navigation always wins', () => {
    expect(classifyRequest('/engine/v1/st/slicer.js', precache, true)).toBe('navigate');
  });
  test('precached shell paths', () => {
    expect(classifyRequest('/assets/index-abc.js', precache, false)).toBe('shell');
    expect(classifyRequest('/catalog/index.json', precache, false)).toBe('shell');
  });
  test('engine variant paths are lazy', () => {
    expect(classifyRequest('/engine/v1/st/slicer.js', precache, false)).toBe('engine');
  });
  test('catalog packs not in the precache are lazy', () => {
    expect(classifyRequest('/catalog/v1/printers/x.deadbeef.json', precache, false)).toBe('catalog-pack');
  });
  test('the preview library chunk is lazy', () => {
    expect(classifyRequest('/assets/GcodePreview-xyz.js', precache, false)).toBe('preview-lib');
  });
  test('anything unrecognized passes through', () => {
    expect(classifyRequest('/robots.txt', precache, false)).toBe('passthrough');
  });
});

describe('verifiesPackHash', () => {
  test('accepts content matching the filename hash prefix', async () => {
    const content = new TextEncoder().encode('{"schema":1}');
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', content))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifiesPackHash(`/catalog/v1/printers/x.${digest.slice(0, 8)}.json`, content.buffer)).toBe(true);
  });
  test('rejects content that does not match the filename hash prefix', async () => {
    const content = new TextEncoder().encode('{"schema":1}');
    expect(await verifiesPackHash('/catalog/v1/printers/x.deadbeef.json', content.buffer)).toBe(false);
  });
  test('passes non-hashed filenames through unverified', async () => {
    expect(await verifiesPackHash('/catalog/index.json', new ArrayBuffer(0))).toBe(true);
  });
});

describe('installShellVersioned', () => {
  test('populates the cache when every fetch succeeds', async () => {
    const storage = new FakeCacheStorage();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => new Response('ok', { status: 200 }));
    await installShellVersioned(storage, 'app-v1', ['/index.html', '/assets/a.js'], fetchImpl as unknown as typeof fetch);
    const cache = await storage.open('app-v1');
    expect(await cache.match('/index.html')).toBeDefined();
    expect(await cache.match('/assets/a.js')).toBeDefined();
  });

  test('discards the partial cache and rethrows when a fetch fails midway (interrupted install)', async () => {
    const storage = new FakeCacheStorage();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/assets/b.js')) throw new Error('network down');
      return new Response('ok', { status: 200 });
    });
    await expect(installShellVersioned(storage, 'app-v2', ['/index.html', '/assets/b.js'], fetchImpl as unknown as typeof fetch)).rejects.toThrow('network down');
    expect(storage.caches.has('app-v2')).toBe(false);
  });

  test('discards the cache when a fetch resolves but is not ok (e.g. 404 mid-install)', async () => {
    const storage = new FakeCacheStorage();
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(installShellVersioned(storage, 'app-v3', ['/missing.js'], fetchImpl as unknown as typeof fetch)).rejects.toThrow(/404/);
    expect(storage.caches.has('app-v3')).toBe(false);
  });
});

describe('activateCleanup', () => {
  test('deletes every cache not in the keep set', async () => {
    const storage = new FakeCacheStorage();
    await storage.open('app-v1'); await storage.open('app-v2'); await storage.open('engine-v1');
    await activateCleanup(storage, new Set(['app-v2', 'engine-v1']));
    expect(await storage.keys()).toEqual(expect.arrayContaining(['app-v2', 'engine-v1']));
    expect(storage.caches.has('app-v1')).toBe(false);
  });

  test('preserves an old complete cache generation until the new one is verified (never called before install succeeds)', async () => {
    const storage = new FakeCacheStorage();
    await storage.open('app-v1');
    // Simulate an interrupted install of v2: installShellVersioned already deleted its own partial cache,
    // so activation is never reached for v2, and v1 is never touched.
    expect(storage.caches.has('app-v1')).toBe(true);
  });
});

describe('handleRequest', () => {
  function context(overrides: Partial<RouteContext> = {}): RouteContext {
    const storage = new FakeCacheStorage();
    return {
      caches: storage,
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => new Response('network', { status: 200 })) as unknown as typeof fetch,
      precacheSet: new Set(['index.html', 'assets/a.js']),
      appCacheName: 'app-v1', engineCacheName: 'engine-v1', catalogCacheName: 'catalog-v1',
      ...overrides,
    };
  }

  test('serves a precached shell file from cache without hitting the network', async () => {
    const ctx = context();
    const cache = await ctx.caches.open(ctx.appCacheName);
    await cache.put(`${ORIGIN}/assets/a.js`, new Response('cached', { status: 200 }));
    const response = await handleRequest(ctx, new Request(`${ORIGIN}/assets/a.js`), false);
    expect(await response.text()).toBe('cached');
    expect(ctx.fetchImpl).not.toHaveBeenCalled();
  });

  test('falls back to network and populates the cache on a shell cache miss', async () => {
    const ctx = context();
    const response = await handleRequest(ctx, new Request(`${ORIGIN}/assets/a.js`), false);
    expect(await response.text()).toBe('network');
    const cache = await ctx.caches.open(ctx.appCacheName);
    expect(await cache.match(`${ORIGIN}/assets/a.js`)).toBeDefined();
  });

  test('serves navigation from the cached index.html', async () => {
    const ctx = context();
    const cache = await ctx.caches.open(ctx.appCacheName);
    await cache.put(`${ORIGIN}/index.html`, new Response('<html>shell</html>', { status: 200 }));
    const response = await handleRequest(ctx, new Request(`${ORIGIN}/some/deep/route`), true);
    expect(await response.text()).toBe('<html>shell</html>');
  });

  test('lazily caches an engine variant asset on first use', async () => {
    const ctx = context();
    const response = await handleRequest(ctx, new Request(`${ORIGIN}/engine/v1/st/slicer.js`), false);
    expect(await response.text()).toBe('network');
    const cache = await ctx.caches.open(ctx.engineCacheName);
    expect(await cache.match(`${ORIGIN}/engine/v1/st/slicer.js`)).toBeDefined();
  });

  test('caches a catalog pack only when its content matches the filename hash', async () => {
    const content = 'pack-bytes';
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))]
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    const good = context({ fetchImpl: vi.fn(async () => new Response(content, { status: 200 })) as unknown as typeof fetch });
    await handleRequest(good, new Request(`${ORIGIN}/catalog/v1/printers/x.${digest.slice(0, 8)}.json`), false);
    expect(await (await good.caches.open('catalog-v1')).match(`${ORIGIN}/catalog/v1/printers/x.${digest.slice(0, 8)}.json`)).toBeDefined();

    const bad = context({ fetchImpl: vi.fn(async () => new Response(content, { status: 200 })) as unknown as typeof fetch });
    await handleRequest(bad, new Request(`${ORIGIN}/catalog/v1/printers/x.deadbeef.json`), false);
    expect(await (await bad.caches.open('catalog-v1')).match(`${ORIGIN}/catalog/v1/printers/x.deadbeef.json`)).toBeUndefined();
  });

  test('passes an unrecognized path straight to the network', async () => {
    const ctx = context();
    const response = await handleRequest(ctx, new Request(`${ORIGIN}/robots.txt`), false);
    expect(await response.text()).toBe('network');
  });
});
