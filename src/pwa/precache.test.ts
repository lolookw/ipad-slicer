import { describe, expect, test } from 'vitest';
import { buildPrecacheManifest, isPrecached, type PrecacheFile } from './precache';

const bytes = (text: string) => new TextEncoder().encode(text);
const file = (path: string, text = path): PrecacheFile => ({ path, bytes: bytes(text).byteLength, content: bytes(text) });

describe('isPrecached', () => {
  test('includes shell chunks, locales, index.html, manifest and catalog entry points', () => {
    for (const path of ['index.html', 'assets/index-abc123.js', 'assets/index-abc.css', 'assets/es-def456.js',
      'assets/engine.worker-ghi.js', 'manifest.webmanifest', 'engine-manifest.json', 'catalog/index.json',
      'catalog/custom-base.json', 'icons/icon.svg']) {
      expect(isPrecached(path)).toBe(true);
    }
  });

  test('excludes lazy engine variant artifacts', () => {
    expect(isPrecached('engine/wasm-v2.4.2-patch19/st/slicer.js')).toBe(false);
    expect(isPrecached('engine/wasm-v2.4.2-patch19/st/slicer.wasm.gz.part0')).toBe(false);
    expect(isPrecached('engine/wasm-v2.4.2-patch19/mt/slicer-mt.js')).toBe(false);
  });

  test('excludes lazy printer packs but keeps the catalog entry points', () => {
    expect(isPrecached('catalog/v2.4.2/printers/bbl-x1c-04.4a639ff2.json')).toBe(false);
    expect(isPrecached('catalog/index.json')).toBe(true);
    expect(isPrecached('catalog/custom-base.json')).toBe(true);
  });

  test('excludes the lazy preview library chunk', () => {
    expect(isPrecached('assets/GcodePreview-DN1ZB3vA.js')).toBe(false);
  });

  test('excludes the service worker file itself and source maps', () => {
    expect(isPrecached('sw.js')).toBe(false);
    expect(isPrecached('assets/index-abc.js.map')).toBe(false);
  });

  test('excludes deploy/legal metadata the client never fetches', () => {
    expect(isPrecached('_headers')).toBe(false);
    expect(isPrecached('LICENSE')).toBe(false);
  });
});

describe('buildPrecacheManifest', () => {
  test('lists only precached files, sorted, and excludes lazy ones', async () => {
    const manifest = await buildPrecacheManifest([
      file('index.html'), file('assets/index-abc.js'),
      file('engine/wasm-v1/st/slicer.js'), file('catalog/v1/printers/x.deadbeef.json'),
      file('assets/GcodePreview-abc.js'),
    ]);
    expect(manifest.files).toEqual(['assets/index-abc.js', 'index.html']);
  });

  test('buildId changes when a precached file changes and is stable when content is unchanged', async () => {
    const a = await buildPrecacheManifest([file('index.html', 'v1'), file('assets/a.js', 'const a = 1;')]);
    const b = await buildPrecacheManifest([file('index.html', 'v1'), file('assets/a.js', 'const a = 1;')]);
    const c = await buildPrecacheManifest([file('index.html', 'v2'), file('assets/a.js', 'const a = 1;')]);
    expect(a.buildId).toBe(b.buildId);
    expect(a.buildId).not.toBe(c.buildId);
  });

  test('buildId does not change when only excluded (lazy) files change', async () => {
    const a = await buildPrecacheManifest([file('index.html'), file('engine/wasm-v1/st/slicer.js', 'one')]);
    const b = await buildPrecacheManifest([file('index.html'), file('engine/wasm-v1/st/slicer.js', 'two')]);
    expect(a.buildId).toBe(b.buildId);
  });

  test('rejects an empty precache result', async () => {
    await expect(buildPrecacheManifest([file('engine/wasm-v1/st/slicer.js')])).rejects.toThrow(/empty/i);
  });
});
