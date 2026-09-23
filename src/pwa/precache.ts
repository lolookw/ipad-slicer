/**
 * Pure, build-time-and-testable precache manifest logic. The Vite plugin (`vite-sw-plugin.ts`)
 * walks the built `dist/` directory, then calls `buildPrecacheManifest` with every emitted file
 * to decide which ones belong in the app-shell precache and to derive a content-addressed
 * BUILD_ID. Nothing here touches the filesystem, so it is testable with in-memory fixtures.
 */

export interface PrecacheFile {
  /** Path relative to the dist root, forward-slash separated, no leading slash (e.g. "assets/index-abc.js"). */
  path: string;
  bytes: number;
  content: Uint8Array;
}

export interface PrecacheManifest {
  buildId: string;
  files: string[];
}

/**
 * Paths that are cached lazily instead of being part of the app-shell precache:
 * - `engine/**`: wasm/js for a specific thread variant, fetched only once that variant is loaded.
 * - `catalog/**`: printer packs, fetched only when selected or referenced by a saved preset.
 *   `catalog/index.json` and `catalog/custom-base.json` are the exception: they are the mutable
 *   catalog entry points and stay part of the shell.
 * - `assets/GcodePreview-*.js`: the toolpath preview library chunk, fetched only when the
 *   Preview step actually opens.
 */
const LAZY_PATTERNS: readonly RegExp[] = [
  /^engine\//,
  /^catalog\/(?!index\.json$|custom-base\.json$)/,
  /^assets\/GcodePreview-[^/]*\.js$/,
];

export function isPrecached(path: string): boolean {
  // `sw.js` is written after this manifest is computed; `_headers` and `LICENSE` are deploy/legal
  // metadata the client never fetches; `.map` files are dev-only diagnostics.
  if (path === 'sw.js' || path === '_headers' || path === 'LICENSE' || path.endsWith('.map')) return false;
  return !LAZY_PATTERNS.some((pattern) => pattern.test(path));
}

function concat(parts: readonly Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the precache manifest from every file the build emitted. `buildId` is a content hash
 * (path + size + bytes of every included file), so it changes exactly when the precached shell
 * changes — including for files whose name is not content-hashed by Vite (`index.html`,
 * `catalog/index.json`, `manifest.webmanifest`, `engine-manifest.json`).
 */
export async function buildPrecacheManifest(files: readonly PrecacheFile[]): Promise<PrecacheManifest> {
  const included = files.filter((file) => isPrecached(file.path)).map((file) => file.path).sort();
  if (!included.length) throw new Error('Precache manifest is empty: nothing to precache');
  const byPath = new Map(files.map((file) => [file.path, file] as const));
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const path of included) {
    const file = byPath.get(path)!;
    parts.push(encoder.encode(`${path}:${file.bytes}\n`));
    parts.push(file.content);
  }
  const digest = await crypto.subtle.digest('SHA-256', concat(parts));
  return { buildId: hex(digest).slice(0, 16), files: included };
}
