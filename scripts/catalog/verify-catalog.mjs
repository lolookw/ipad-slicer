import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function verifyCatalog(indexPath = 'public/catalog/index.json', { configPath } = {}) {
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  if (index.schema !== 1 || !Array.isArray(index.vendors)) throw new Error('Unsupported catalog index');
  const ids = new Set();
  let combos = 0;
  for (const vendor of index.vendors) for (const model of vendor.models) {
    if (ids.has(model.id)) throw new Error(`Duplicate printer id: ${model.id}`);
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
    const configBytes = await readFile(configPath);
    const config = JSON.parse(configBytes);
    const lock = JSON.parse(await readFile('catalog.presets.lock.json'));
    const configSha256 = createHash('sha256').update(configBytes).digest('hex');
    if (lock.configSha256 !== configSha256 || lock.commit !== config.source.commit || lock.tag !== config.source.tag)
      throw new Error('Preset acquisition lock does not match catalog config');
    const expectedVendors = config.vendors.map(vendor => vendor.id).sort();
    const actualVendors = index.vendors.map(vendor => vendor.id).sort();
    if (JSON.stringify(actualVendors) !== JSON.stringify(expectedVendors)) throw new Error('Catalog vendor coverage mismatch');
    for (const vendor of index.vendors) for (const model of vendor.models) {
      const pack = JSON.parse(await readFile(join(dirname(indexPath), model.pack)));
      if (pack.meta?.source?.commit !== config.source.commit) throw new Error(`Unpinned pack provenance: ${model.id}`);
      for (const type of ['PLA', 'PETG', 'ABS']) if (!pack.filaments.some(entry => entry.type === type))
        throw new Error(`${model.id} has no passing ${type} combination`);
      for (const rung of ['draft', 'standard', 'fine']) if (!pack.processes.some(entry => entry.ladder === rung))
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
  verifyCatalog(process.argv[2], { configPath: 'catalog.config.json' })
    .then(result => console.log(`Verified ${result.printers} printer packs and ${result.combos} smoke-gated combinations`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
