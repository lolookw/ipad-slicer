import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const configPath = 'catalog.config.json';
const cacheDir = '.engine-cache/orca-profiles-v2.4.2';
const lockPath = 'catalog.presets.lock.json';
const configBytes = await readFile(configPath);
const config = JSON.parse(configBytes);
const { repository, tag, commit } = config.source;
if (!/^https:\/\/github\.com\/SoftFever\/OrcaSlicer$/.test(repository) ||
    tag !== 'v2.4.2' || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Catalog source is not the pinned official v2.4.2 repository commit');

const requested = new Map();
function request(source, kind, name) {
  const key = `${source}:${kind}`;
  if (!requested.has(key)) requested.set(key, new Set());
  requested.get(key).add(name);
}
for (const vendor of config.vendors) for (const model of vendor.models) {
  request(vendor.source, 'machine', model.machine);
  for (const entry of model.processes) request(entry.source ?? vendor.source, 'process', entry.preset);
  for (const entry of model.filaments) request(entry.source ?? vendor.source, 'filament', entry.preset);
}
request(config.customBase.source, 'machine', config.customBase.machine);
for (const entry of config.customBase.processes) request(entry.source ?? config.customBase.source, 'process', entry.preset);
for (const entry of config.customBase.filaments) request(entry.source ?? config.customBase.source, 'filament', entry.preset);

await mkdir(cacheDir, { recursive: true });
const records = [];
const indexes = new Map();
const rawRoot = `https://raw.githubusercontent.com/SoftFever/OrcaSlicer/${commit}/resources/profiles`;
async function download(path, destination) {
  const response = await fetch(encodeURI(`${rawRoot}/${path}`), { redirect: 'error' });
  if (!response.ok) throw new Error(`Preset acquisition failed (${response.status}): ${path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
  records.push({ path, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
  return JSON.parse(bytes);
}

for (const source of new Set([...requested.keys()].map(key => key.split(':')[0]))) {
  if (config.directSources[source]) {
    const index = { name: source };
    for (const [kind, entries] of Object.entries(config.directSources[source]))
      index[`${kind}_list`] = Object.entries(entries).map(([name, sub_path]) => ({ name, sub_path }));
    const bytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
    await writeFile(join(cacheDir, `index-${source}.json`), bytes);
    records.push({ path: `generated:index-${source}.json`, bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex') });
    indexes.set(source, index);
  } else {
    indexes.set(source, await download(`${source}.json`, join(cacheDir, `index-${source}.json`)));
  }
}

const fetched = new Set();
async function fetchPreset(source, kind, name) {
  const key = `${source}:${kind}:${name}`;
  if (fetched.has(key)) return;
  const index = indexes.get(source);
  const entry = index?.[`${kind}_list`]?.find(candidate => candidate.name === name);
  if (!entry) throw new Error(`Pinned index has no ${source} ${kind} preset named ${name}`);
  const path = `${source}/${entry.sub_path}`;
  const file = `${source}__${entry.sub_path.replaceAll('/', '__')}`;
  const preset = await download(path, join(cacheDir, file));
  if (preset.name !== name) throw new Error(`${path} declares ${preset.name}, expected ${name}`);
  fetched.add(key);
  if (preset.inherits) await fetchPreset(source, kind, preset.inherits);
}
for (const [key, names] of requested) {
  const [source, kind] = key.split(':');
  for (const name of names) await fetchPreset(source, kind, name);
}

records.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(lockPath, `${JSON.stringify({ schema: 1, repository, tag, commit,
  configSha256: createHash('sha256').update(configBytes).digest('hex'), files: records }, null, 2)}\n`);
console.log(`Acquired ${records.length} pinned profile files from ${tag} (${commit.slice(0, 12)})`);
