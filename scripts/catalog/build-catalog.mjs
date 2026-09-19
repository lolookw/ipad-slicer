import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCatalogConfig } from './config.mjs';
import { createPresetSource } from './resolve.mjs';

export function stableJson(value) {
  const normalize = item => Array.isArray(item) ? item.map(normalize) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])])) : item;
  return `${JSON.stringify(normalize(value))}\n`;
}

function assertCompatible(meta, machine, entry) {
  if (meta.compatiblePrinters?.includes(machine)) return;
  if (entry.conditionOnly) return;
  throw new Error(`${entry.preset} is not explicitly compatible with ${machine}; curate a condition-only exception`);
}

export async function resolvePack(source, owner, model) {
  const machine = await source.resolve(owner.source, 'machine', model.machine);
  const processes = await Promise.all(model.processes.map(async entry => {
    const resolved = await source.resolve(entry.source ?? owner.source, 'process', entry.preset);
    assertCompatible(resolved.meta, model.machine, entry);
    return { id: entry.id, name: entry.name, ladder: entry.ladder,
      layerHeight: Number(entry.fixups?.layer_height ?? resolved.settings.layer_height),
      settings: { ...resolved.settings, ...entry.fixups }, meta: resolved.meta,
      conditionOnly: entry.conditionOnly };
  }));
  const filaments = await Promise.all(model.filaments.map(async entry => {
    const resolved = await source.resolve(entry.source ?? owner.source, 'filament', entry.preset);
    assertCompatible(resolved.meta, model.machine, entry);
    return { id: entry.id, name: entry.name, type: entry.type,
      settings: { ...resolved.settings, ...entry.fixups }, meta: resolved.meta,
      conditionOnly: entry.conditionOnly };
  }));
  return { machine: { ...machine.settings, ...model.fixups }, machineMeta: machine.meta, processes, filaments };
}

function combinations(model) {
  return model.combos ?? model.processes.flatMap(process => model.filaments.map(filament => [process.id, filament.id]));
}

async function makePack(config, source, owner, model, passing) {
  const resolved = await resolvePack(source, owner, model);
  const combos = combinations(model).filter(([processId, filamentId]) =>
    passing.has(`${model.id}:${processId}:${filamentId}`));
  if (!combos.length && model.required !== false) throw new Error(`Required model has no passing combinations: ${model.id}`);
  if (!combos.length) return;
  const processIds = new Set(combos.map(([id]) => id));
  const filamentIds = new Set(combos.map(([, id]) => id));
  // Optional (generated) printers ship only with a smoke-passed Standard + PLA path; anything less is dropped.
  if (model.required === false && !(resolved.filaments.some(entry => filamentIds.has(entry.id) && entry.type === 'PLA') &&
      resolved.processes.some(entry => processIds.has(entry.id) && entry.ladder === 'standard'))) return;
  return { schema: 1, id: model.id, vendor: owner.id, model: model.name, nozzle: model.nozzle ?? 0.4,
    machine: resolved.machine,
    processes: resolved.processes.filter(entry => processIds.has(entry.id))
      .map(({ meta: _meta, conditionOnly: _conditionOnly, ...entry }) => entry),
    filaments: resolved.filaments.filter(entry => filamentIds.has(entry.id))
      .map(({ meta: _meta, conditionOnly: _conditionOnly, ...entry }) => entry), combos,
    meta: { source: config.source, engineRelease: config.engineRelease, passed: combos,
      machine: resolved.machineMeta,
      processes: Object.fromEntries(resolved.processes.map(entry => [entry.id,
        { ...entry.meta, conditionOnly: entry.conditionOnly }])),
      filaments: Object.fromEntries(resolved.filaments.map(entry => [entry.id,
        { ...entry.meta, conditionOnly: entry.conditionOnly }])) } };
}

export async function buildCatalog(config, passing, { source = createPresetSource(), outputDir = 'public/catalog' } = {}) {
  const root = join(outputDir, config.orcaTag);
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, 'printers'), { recursive: true });
  const vendors = [];
  for (const vendor of config.vendors) {
    const models = [];
    for (const model of vendor.models) {
      const pack = await makePack(config, source, vendor, model, passing);
      if (!pack) continue;
      const bytes = Buffer.from(stableJson(pack));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const file = `${model.id}.${sha256.slice(0, 8)}.json`;
      await writeFile(join(root, 'printers', file), bytes);
      models.push({ id: model.id, name: model.name, nozzle: model.nozzle, curated: model.curated === true,
        pack: `${config.orcaTag}/printers/${file}`, bytes: bytes.byteLength, sha256 });
    }
    if (models.length) vendors.push({ id: vendor.id, name: vendor.name, models });
  }
  const index = { schema: 2, orcaTag: config.orcaTag, engineRelease: config.engineRelease, vendors };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'index.json'), stableJson(index));
  if (config.customBase) {
    const custom = { ...config.customBase, required: true, nozzle: 0.4 };
    const customPack = await makePack(config, source, { id: 'custom', source: custom.source }, custom, passing);
    await writeFile(join(outputDir, 'custom-base.json'), stableJson(customPack));
  }
  return index;
}

async function main() {
  const { config } = await loadCatalogConfig();
  const results = JSON.parse(await readFile('.engine-cache/catalog-smoke-results.json', 'utf8'));
  const index = await buildCatalog(config, new Set(results.filter(result => result.pass).map(result => result.combo)));
  const shipped = new Set(index.vendors.flatMap(vendor => vendor.models.map(model => model.id)));
  const dropped = config.vendors.flatMap(vendor => vendor.models.filter(model => !shipped.has(model.id)).map(model => model.id));
  console.log(`Built ${shipped.size} printer packs; dropped ${dropped.length} without a passing combination${dropped.length ? `: ${dropped.join(', ')}` : ''}`);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
