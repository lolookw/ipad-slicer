import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CURATED_CONFIG, GENERATED_CONFIG, loadCatalogConfig } from './config.mjs';

export async function verifyCatalog(indexPath = 'public/catalog/index.json', { configPath, generatedPath = GENERATED_CONFIG } = {}) {
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  if (index.schema !== 2 || !Array.isArray(index.vendors)) throw new Error('Unsupported catalog index');
  const ids = new Set();
  let combos = 0;
  for (const vendor of index.vendors) for (const model of vendor.models) {
    if (ids.has(model.id)) throw new Error(`Duplicate printer id: ${model.id}`);
    if (typeof model.curated !== 'boolean') throw new Error(`Model lacks a curated flag: ${model.id}`);
    ids.add(model.id);
    const bytes = await readFile(join(dirname(indexPath), model.pack));
    if (bytes.byteLength !== model.bytes) throw new Error(`Length mismatch: ${model.pack}`);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== model.sha256) throw new Error(`SHA-256 mismatch: ${model.pack}`);
    const pack = JSON.parse(bytes);
    if (pack.schema !== 1 || pack.id !== model.id) throw new Error(`Invalid pack: ${model.pack}`);
    for (const [processId, filamentId] of pack.combos) {
      if (!pack.processes.some(entry => entry.id === processId) || !pack.filaments.some(entry => entry.id === filamentId))
        throw new Error(`Broken combination reference: ${model.id}`);
      if (!pack.meta?.passed?.some(([process, filament]) => process === processId && filament === filamentId))
        throw new Error(`Combination lacks smoke evidence: ${model.id}:${processId}:${filamentId}`);
      combos += 1;
    }
  }
  if (configPath) {
    const { config, curatedSha256, generatedSha256 } = await loadCatalogConfig({ curatedPath: configPath, generatedPath });
    const lock = JSON.parse(await readFile('catalog.presets.lock.json'));
    if (lock.configSha256 !== curatedSha256 || (lock.generatedConfigSha256 ?? null) !== generatedSha256 ||
        lock.commit !== config.source.commit || lock.tag !== config.source.tag)
      throw new Error('Preset acquisition lock does not match catalog config');
    const configured = new Map(config.vendors.flatMap(vendor => vendor.models.map(model => [model.id, { vendor, model }])));
    const shipped = new Set(index.vendors.flatMap(vendor => vendor.models.map(model => model.id)));
    // Generated models may be dropped by smoke, but anything the curated config requires must ship.
    for (const [id, { model }] of configured) if (model.required !== false && !shipped.has(id))
      throw new Error(`Required printer is missing from the catalog: ${id}`);
    for (const vendor of index.vendors) for (const model of vendor.models) {
      const entry = configured.get(model.id);
      if (!entry || entry.vendor.id !== vendor.id) throw new Error(`Printer is not in the catalog config: ${model.id}`);
      if (model.curated !== entry.model.curated) throw new Error(`Curated flag disagrees with config: ${model.id}`);
      const pack = JSON.parse(await readFile(join(dirname(indexPath), model.pack)));
      if (pack.meta?.source?.commit !== config.source.commit) throw new Error(`Unpinned pack provenance: ${model.id}`);
      const types = model.curated ? ['PLA', 'PETG', 'ABS'] : ['PLA'];
      const rungs = model.curated ? ['draft', 'standard', 'fine'] : ['standard'];
      for (const type of types) if (!pack.filaments.some(entry => entry.type === type))
        throw new Error(`${model.id} has no passing ${type} combination`);
      for (const rung of rungs) if (!pack.processes.some(entry => entry.ladder === rung))
        throw new Error(`${model.id} has no passing ${rung} process`);
    }
    const custom = JSON.parse(await readFile(join(dirname(indexPath), 'custom-base.json')));
    if (custom.schema !== 1 || custom.id !== config.customBase.id || !custom.combos.length)
      throw new Error('Invalid custom printer base');
    combos += custom.combos.length;
  }
  return { printers: ids.size, combos };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href)
  verifyCatalog(process.argv[2], { configPath: CURATED_CONFIG })
    .then(result => console.log(`Verified ${result.printers} printer packs and ${result.combos} smoke-gated combinations`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
