import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertPinnedSource, createAcquirer } from './acquire.mjs';
import { loadCatalogConfig } from './config.mjs';

const cacheDir = '.engine-cache/orca-profiles-v2.4.2';
const lockPath = 'catalog.presets.lock.json';
const { config, curatedSha256, generatedSha256 } = await loadCatalogConfig();
const { repository, tag, commit } = config.source;
assertPinnedSource(config.source);

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

const acquirer = createAcquirer({ commit, cacheDir });
await acquirer.init();
for (const source of new Set([...requested.keys()].map(key => key.split(':')[0]))) {
  if (config.directSources[source]) {
    const index = { name: source };
    for (const [kind, entries] of Object.entries(config.directSources[source]))
      index[`${kind}_list`] = Object.entries(entries).map(([name, sub_path]) => ({ name, sub_path }));
    const bytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
    await writeFile(join(cacheDir, `index-${source}.json`), bytes);
    acquirer.record(`generated:index-${source}.json`, bytes);
    acquirer.setIndex(source, index);
  } else await acquirer.index(source);
}
const tasks = [];
for (const [key, names] of requested) {
  const [source, kind] = key.split(':');
  for (const name of names) tasks.push(acquirer.preset(source, kind, name));
}
await Promise.all(tasks);

const records = [...acquirer.records.values()].sort((a, b) => a.path.localeCompare(b.path));
await writeFile(lockPath, `${JSON.stringify({ schema: 1, repository, tag, commit,
  configSha256: curatedSha256, generatedConfigSha256: generatedSha256, files: records }, null, 2)}\n`);

console.log(`Acquired ${records.length} pinned profile files from ${tag} (${commit.slice(0, 12)})`);
