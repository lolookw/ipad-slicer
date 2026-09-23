import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { swPlugin } from './vite-sw-plugin';

let dir: string | undefined;
afterEach(async () => {
  if (dir) { await rm(dir, { recursive: true, force: true }); dir = undefined; }
});

describe('swPlugin', () => {
  test('is a build-only plugin', () => {
    const plugin = swPlugin();
    expect(plugin.name).toBe('ipad-slicer:sw');
    expect(plugin.apply).toBe('build');
  });

  test('closeBundle walks dist, builds a precache manifest, and emits sw.js with BUILD_ID and the precache list injected', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ipad-slicer-sw-'));
    const outDir = join(dir, 'dist');
    await mkdir(join(outDir, 'assets'), { recursive: true });
    await mkdir(join(outDir, 'engine', 'v1', 'st'), { recursive: true });
    await writeFile(join(outDir, 'index.html'), '<html></html>');
    await writeFile(join(outDir, 'assets', 'index-abc.js'), 'console.log(1)');
    await writeFile(join(outDir, 'engine', 'v1', 'st', 'slicer.js'), 'lazy-engine-asset');

    // `resolve` against the repo root (Vitest's process.cwd()) rather than `import.meta.url` +
    // `fileURLToPath`: under the jsdom test environment, `URL` is jsdom's own realm-local
    // implementation, and Node's `fileURLToPath` rejects a URL instance from a foreign realm.
    const plugin = swPlugin({ swEntry: resolve(process.cwd(), 'src/pwa/sw.ts') });
    // These hooks are plain functions on this plugin (no object-with-handler form), so they can be
    // invoked directly without spinning up a full Vite dev/build pipeline around this unit test.
    (plugin.configResolved as (config: unknown) => void)({ root: dir, build: { outDir: 'dist', ssr: false } });
    await (plugin.closeBundle as () => Promise<void>)();

    const swSource = await readFile(join(outDir, 'sw.js'), 'utf8');
    expect(swSource).toContain('ipad-slicer-app-');
    expect(swSource).toMatch(/index-abc\.js/);
    expect(swSource).not.toMatch(/["']engine\/v1\/st\/slicer\.js["']/);
  }, 30_000);
});
