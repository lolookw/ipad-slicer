import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PINNED_REPOSITORY = /^https:\/\/github\.com\/SoftFever\/OrcaSlicer$/;
const SAFE_PATH = /^[\w][\w .()@+,'\-/]*\.json$/;

export function assertPinnedSource({ repository, tag, commit }) {
  if (!PINNED_REPOSITORY.test(repository) || tag !== 'v2.4.2' || !/^[a-f0-9]{40}$/.test(commit))
    throw new Error('Catalog source is not the pinned official v2.4.2 repository commit');
}

export const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Downloads files from the pinned OrcaSlicer commit (redirects rejected, paths validated) into a cache
 * directory laid out as `index-<source>.json` and `<source>__<sub_path with __>`. Every download is recorded
 * with its length and SHA-256 so callers can lock what they acquired.
 */
export function createAcquirer({ commit, cacheDir, concurrency = 12, fetcher = fetch }) {
  const rawRoot = `https://raw.githubusercontent.com/SoftFever/OrcaSlicer/${commit}/resources/profiles`;
  const records = new Map();
  const indexes = new Map();
  const presets = new Map();
  const waiting = [];
  let active = 0;

  function limit(task) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active += 1;
        try { resolve(await task()); } catch (error) { reject(error); } finally { active -= 1; waiting.shift()?.(); }
      };
      if (active < concurrency) void run(); else waiting.push(run);
    });
  }

  function record(path, bytes) {
    records.set(path, { path, bytes: bytes.byteLength, sha256: sha256Hex(bytes) });
  }

  async function download(path, destination) {
    if (!SAFE_PATH.test(path) || path.includes('..')) throw new Error(`Unsafe preset path: ${path}`);
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await limit(() => fetcher(encodeURI(`${rawRoot}/${path}`), { redirect: 'error' }));
        if (response.status === 404) throw Object.assign(new Error(`Preset acquisition failed (404): ${path}`), { fatal: true });
        if (!response.ok) throw new Error(`Preset acquisition failed (${response.status}): ${path}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const value = JSON.parse(bytes);
        await writeFile(destination, bytes);
        record(path, bytes);
        return value;
      } catch (error) {
        lastError = error;
        if (error.fatal) break;
      }
    }
    throw lastError;
  }

  return {
    records,
    record,
    async init() { await mkdir(cacheDir, { recursive: true }); },
    setIndex(source, index) { indexes.set(source, Promise.resolve(index)); },
    index(source) {
      if (!indexes.has(source)) indexes.set(source, download(`${source}.json`, join(cacheDir, `index-${source}.json`)));
      return indexes.get(source);
    },
    /** Fetches a preset and its whole `inherits` chain; concurrent calls share one download. */
    preset(source, kind, name) {
      const key = `${source}:${kind}:${name}`;
      if (!presets.has(key)) presets.set(key, (async () => {
        const index = await this.index(source);
        const entry = index[`${kind}_list`]?.find(candidate => candidate.name === name);
        if (!entry) throw new Error(`Pinned index has no ${source} ${kind} preset named ${name}`);
        const path = `${source}/${entry.sub_path}`;
        const preset = await download(path, join(cacheDir, `${source}__${entry.sub_path.replaceAll('/', '__')}`));
        if (preset.name !== name) throw new Error(`${path} declares ${preset.name}, expected ${name}`);
        if (preset.inherits) await this.preset(source, kind, preset.inherits);
        return preset;
      })());
      return presets.get(key);
    },
  };
}
