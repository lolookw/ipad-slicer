// Vite plugin: after the main build finishes, walks the emitted `dist/` directory, builds the
// precache manifest (`precache.ts`), and bundles `sw.ts` on its own (via a nested, config-free
// `vite build()` call) into `<outDir>/sw.js` with `BUILD_ID` and the precache list injected as
// constants. Hand-written instead of vite-plugin-pwa because engine parts need per-variant lazy
// caching and headers must be preserved exactly (see design.md, "Offline PWA").
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild, type Plugin, type ResolvedConfig } from 'vite';
import { buildPrecacheManifest, type PrecacheFile } from './precache';

export interface SwPluginOptions {
  /** Absolute path to the service worker entry. Defaults to `sw.ts` next to this file. */
  swEntry?: string;
  /** Defaults to `process.env.SW_KILL === '1'`. See sw.ts for what the kill-switch build does. */
  killSwitch?: boolean;
}

async function walk(dir: string, base = dir): Promise<PrecacheFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: PrecacheFile[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { files.push(...(await walk(full, base))); continue; }
    if (!entry.isFile()) continue;
    const content = await readFile(full);
    files.push({ path: relative(base, full).split(sep).join('/'), bytes: content.byteLength, content: new Uint8Array(content) });
  }
  return files;
}

export function swPlugin(options: SwPluginOptions = {}): Plugin {
  let config: ResolvedConfig;
  const killSwitch = options.killSwitch ?? process.env.SW_KILL === '1';
  return {
    name: 'ipad-slicer:sw',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    async closeBundle() {
      if (config.build.ssr) return;
      const outDir = resolve(config.root, config.build.outDir);
      const files = await walk(outDir);
      const manifest = await buildPrecacheManifest(files);
      const swEntry = options.swEntry ?? fileURLToPath(new URL('./sw.ts', import.meta.url));
      if (killSwitch) {
        // eslint-disable-next-line no-console
        console.warn('[ipad-slicer:sw] SW_KILL=1: emitting a kill-switch service worker. Deploy it, then deploy a normal build again.');
      }
      // A fresh, config-free build: this must NOT reload vite.config.ts (which would re-run this
      // very plugin) and must not inherit the app's Solid/JSX plugin, which sw.ts does not need.
      await viteBuild({
        root: config.root,
        configFile: false,
        logLevel: 'warn',
        define: {
          __SW_BUILD_ID__: JSON.stringify(manifest.buildId),
          __SW_PRECACHE__: JSON.stringify(manifest.files),
          __SW_KILL_SWITCH__: JSON.stringify(killSwitch),
        },
        build: {
          outDir,
          emptyOutDir: false,
          minify: false,
          target: 'es2022',
          lib: { entry: swEntry, formats: ['iife'], name: '__ipadSlicerSw', fileName: () => 'sw.js' },
        },
      });
    },
  };
}
