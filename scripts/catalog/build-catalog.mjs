import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPresetSource } from './resolve.mjs';

export function stableJson(value) {
  const normalize = item => Array.isArray(item) ? item.map(normalize) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])])) : item;
  return `${JSON.stringify(normalize(value))}\n`;
}

export async function buildCatalog(config, passing, { source = createPresetSource(), outputDir = 'public/catalog' } = {}) {
  const root = join(outputDir, config.orcaTag);
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, 'printers'), { recursive: true });
  const vendors = [];
  for (const vendor of config.vendors) {
    const models = [];
    for (const model of vendor.models) {
      const machine = await source.resolve(vendor.source, 'machine', model.machine);
      const processes = await Promise.all(model.processes.map(async entry => {
        const resolved = await source.resolve(vendor.source, 'process', entry.preset);
        return { id: entry.id, name: entry.name, ladder: entry.ladder,
          layerHeight: Number(resolved.settings.layer_height), settings: resolved.settings, meta: resolved.meta };
      }));
      const filaments = await Promise.all(model.filaments.map(async entry => {
        const resolved = await source.resolve(entry.source ?? vendor.source, 'filament', entry.preset);
        return { id: entry.id, name: entry.name, type: entry.type, settings: resolved.settings, meta: resolved.meta };
      }));
      const combos = model.combos.filter(([processId, filamentId]) =>
        passing.has(`${model.id}:${processId}:${filamentId}`));
      if (!combos.length) {
        if (model.required) throw new Error(`Required model has no passing combinations: ${model.id}`);
        continue;
      }
      const pack = { schema: 1, id: model.id, vendor: vendor.id, model: model.name, nozzle: model.nozzle,
        machine: { ...machine.settings, ...model.fixups },
        processes: processes.map(({ meta: _meta, ...entry }) => entry),
        filaments: filaments.map(({ meta: _meta, ...entry }) => entry), combos,
        meta: { machine: machine.meta, processes: Object.fromEntries(processes.map(entry => [entry.id, entry.meta])),
          filaments: Object.fromEntries(filaments.map(entry => [entry.id, entry.meta])) } };
      const bytes = Buffer.from(stableJson(pack));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const file = `${model.id}.${sha256.slice(0, 8)}.json`;
      await writeFile(join(root, 'printers', file), bytes);
      models.push({ id: model.id, name: model.name, nozzle: model.nozzle,
        pack: `${config.orcaTag}/printers/${file}`, bytes: bytes.byteLength, sha256 });
    }
    if (models.length) vendors.push({ id: vendor.id, name: vendor.name, models });
  }
  const index = { schema: 1, orcaTag: config.orcaTag, engineRelease: config.engineRelease, vendors };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'index.json'), stableJson(index));
  return index;
}

async function main() {
  const config = JSON.parse(await readFile('catalog.config.json', 'utf8'));
  const results = JSON.parse(await readFile('.engine-cache/catalog-smoke-results.json', 'utf8'));
  await buildCatalog(config, new Set(results.filter(result => result.pass).map(result => result.combo)));
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
