import { readFile } from 'node:fs/promises';
import { sha256Hex } from './acquire.mjs';

export const CURATED_CONFIG = 'catalog.config.json';
export const GENERATED_CONFIG = 'catalog.generated.config.json';

/**
 * Merges the hand-curated config with the generated one. Curated models always win: a generated model is
 * dropped when it shares an id or a machine preset with a curated model of the same vendor source.
 */
export function mergeConfigs(curated, generated) {
  const vendors = curated.vendors.map(vendor => ({ ...vendor,
    models: vendor.models.map(model => ({ ...model, curated: true })) }));
  const taken = new Set(vendors.flatMap(vendor => vendor.models.flatMap(model =>
    [`id:${model.id}`, `machine:${vendor.source}:${model.machine}`])));
  for (const vendor of generated?.vendors ?? []) {
    const models = vendor.models.filter(model => !taken.has(`id:${model.id}`) &&
      !taken.has(`machine:${vendor.source}:${model.machine}`))
      .map(model => ({ ...model, curated: false, required: false }));
    for (const model of models) taken.add(`id:${model.id}`);
    const existing = vendors.find(candidate => candidate.id === vendor.id);
    if (existing) existing.models.push(...models);
    else if (models.length) vendors.push({ ...vendor, models });
  }
  return { ...curated, vendors };
}

async function readOptional(path) {
  try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

export async function loadCatalogConfig({ curatedPath = CURATED_CONFIG, generatedPath = GENERATED_CONFIG } = {}) {
  const curatedBytes = await readFile(curatedPath);
  const generatedBytes = await readOptional(generatedPath);
  const curated = JSON.parse(curatedBytes);
  const generated = generatedBytes ? JSON.parse(generatedBytes) : undefined;
  if (generated && JSON.stringify(generated.source) !== JSON.stringify(curated.source))
    throw new Error('Generated catalog config is not pinned to the curated source commit');
  return { config: mergeConfigs(curated, generated), curated, generated,
    curatedSha256: sha256Hex(curatedBytes), generatedSha256: generatedBytes ? sha256Hex(generatedBytes) : null };
}
