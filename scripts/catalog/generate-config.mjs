import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { assertPinnedSource, createAcquirer } from './acquire.mjs';
import { CURATED_CONFIG, GENERATED_CONFIG, loadCatalogConfig } from './config.mjs';
import { createPresetSource } from './resolve.mjs';

const EXPLORE_DIR = '.engine-cache/orca-explore-v2.4.2';

/** Vendors in priority order; curated ids keep the curated vendor ids so the two configs merge by vendor. */
export const VENDORS = [
  ['creality', 'Creality', 'Creality'], ['elegoo', 'Elegoo', 'Elegoo'], ['anycubic', 'Anycubic', 'Anycubic'],
  ['prusa', 'Prusa', 'Prusa'], ['bbl', 'Bambu Lab', 'BBL'], ['voron', 'Voron', 'Voron'],
  ['qidi', 'Qidi', 'Qidi'], ['flashforge', 'Flashforge', 'Flashforge'], ['artillery', 'Artillery', 'Artillery'],
  ['sovol', 'Sovol', 'Sovol'], ['snapmaker', 'Snapmaker', 'Snapmaker'], ['biqu', 'BIQU', 'BIQU'],
  ['flsun', 'FLSUN', 'FLSun'], ['geeetech', 'Geeetech', 'Geeetech'], ['kingroon', 'Kingroon', 'Kingroon'],
  ['ratrig', 'Rat Rig', 'Ratrig'], ['twotrees', 'Two Trees', 'TwoTrees'], ['tronxy', 'Tronxy', 'Tronxy'],
  ['anker', 'Anker', 'Anker'], ['blocks', 'BLOCKS', 'Blocks'], ['colido', 'CoLiDo', 'CoLiDo'],
  ['comgrow', 'Comgrow', 'Comgrow'], ['eryone', 'Eryone', 'Eryone'], ['magicmaker', 'MagicMaker', 'MagicMaker'],
  ['voxelab', 'Voxelab', 'Voxelab'], ['wanhao', 'Wanhao', 'Wanhao'], ['lulzbot', 'LulzBot', 'Lulzbot'],
  ['raise3d', 'Raise3D', 'Raise3D'], ['volumic', 'Volumic', 'Volumic'], ['infimech', 'InfiMech', 'InfiMech'],
  ['mellow', 'Mellow', 'Mellow'], ['peopoly', 'Peopoly', 'Peopoly'], ['positron3d', 'Positron3D', 'Positron3D'],
  ['vivedino', 'Vivedino', 'Vivedino'], ['wemake3d', 'WEMAKE3D', 'WEMAKE3D'], ['afinia', 'Afinia', 'Afinia'],
  ['cubicon', 'Cubicon', 'Cubicon'], ['zbolt', 'Z-Bolt', 'Z-Bolt'], ['chuanying', 'Chuanying', 'Chuanying'],
  ['iq', 'iQ', 'iQ'], ['orcaarena', 'OrcaArena', 'OrcaArena'],
].map(([id, name, source]) => ({ id, name, source }));

/** Fixups every curated model applies: universal ones plus the Bambu bed type the curated Bambu models use. */
const fixupsFor = vendor => ({ ...(vendor.id === 'bbl' ? { curr_bed_type: 'Textured PEI Plate' } : {}),
  use_relative_e_distances: '1' });

const RUNGS = {
  fine: { want: 0.12, min: 0.08, max: 0.16, name: 'Fine', keyword: /fine|detail|optimal|quality/i },
  standard: { want: 0.2, min: 0.2, max: 0.2, name: 'Standard', keyword: /standard/i },
  draft: { want: 0.24, min: 0.24, max: 0.3, name: 'Draft', keyword: /draft|speed/i },
};
const TYPES = ['PLA', 'PETG', 'ABS'];
const GENERIC_FILAMENT = /^(?:.+ )?Generic (PLA|PETG|ABS)(?: @.+)?$/;

export function pickMachine(modelName, machineNames) {
  return [`${modelName} 0.4 nozzle`, `${modelName} (0.4 nozzle)`].find(name => machineNames.includes(name));
}

export function pickProcesses(candidates) {
  const picked = {};
  for (const [rung, spec] of Object.entries(RUNGS)) {
    const best = candidates.filter(entry => entry.layerHeight >= spec.min - 1e-6 && entry.layerHeight <= spec.max + 1e-6)
      .sort((a, b) => Math.abs(a.layerHeight - spec.want) - Math.abs(b.layerHeight - spec.want) ||
        Number(spec.keyword.test(b.name)) - Number(spec.keyword.test(a.name)) ||
        a.name.length - b.name.length || a.name.localeCompare(b.name))[0];
    if (best) picked[rung] = best.name;
  }
  return picked.standard ? picked : undefined;
}

export function pickFilaments(candidates) {
  const picked = {};
  for (const type of TYPES) {
    const best = candidates.filter(entry => entry.type === type && GENERIC_FILAMENT.exec(entry.name)?.[1] === type)
      .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))[0];
    if (best) picked[type] = best.name;
  }
  return picked.PLA ? picked : undefined;
}

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const modelId = (vendorId, name) => `${vendorId}-${slug(name)}-04`;
export function displayName(vendorName, model) {
  const prefix = `${vendorName} `;
  return model.toLowerCase().startsWith(prefix.toLowerCase()) ? model.slice(prefix.length) : model;
}

const first = value => Array.isArray(value) ? value[0] : value;

async function generateVendor(vendor, acquirer, resolver) {
  const index = await acquirer.index(vendor.source);
  const machineNames = (index.machine_list ?? []).map(entry => entry.name);
  const report = { vendor: vendor.id, attempted: 0, generated: 0, skipped: {} };
  const skip = reason => { report.skipped[reason] = (report.skipped[reason] ?? 0) + 1; };

  const resolveKind = async (kind, name) => {
    try { await acquirer.preset(vendor.source, kind, name); return await resolver.resolve(vendor.source, kind, name); }
    catch { return undefined; }
  };
  const processes = (await Promise.all((index.process_list ?? []).map(entry => entry.name)
    .filter(name => /^0\.\d+mm /.test(name)).map(async name => {
      const resolved = await resolveKind('process', name);
      const layerHeight = Number(first(resolved?.settings.layer_height));
      return resolved && layerHeight ? { name, layerHeight, compatible: resolved.meta.compatiblePrinters ?? [] } : undefined;
    }))).filter(Boolean);
  const filaments = (await Promise.all((index.filament_list ?? []).map(entry => entry.name)
    .filter(name => GENERIC_FILAMENT.test(name)).map(async name => {
      const resolved = await resolveKind('filament', name);
      return resolved ? { name, type: first(resolved.settings.filament_type), compatible: resolved.meta.compatiblePrinters ?? [] } : undefined;
    }))).filter(Boolean);

  const models = [];
  for (const { name: modelName } of index.machine_model_list ?? []) {
    report.attempted += 1;
    const machine = pickMachine(modelName, machineNames);
    if (!machine) { skip('no 0.4 nozzle machine'); continue; }
    const resolved = await resolveKind('machine', machine);
    if (!resolved || Number(first(resolved.settings.nozzle_diameter)) !== 0.4) { skip('machine is not a resolvable 0.4 nozzle'); continue; }
    const processPick = pickProcesses(processes.filter(entry => entry.compatible.includes(machine)));
    if (!processPick) { skip('no compatible 0.20 mm process'); continue; }
    const filamentPick = pickFilaments(filaments.filter(entry => entry.compatible.includes(machine)));
    if (!filamentPick) { skip('no compatible generic PLA'); continue; }
    const name = displayName(vendor.name, modelName);
    models.push({ id: modelId(vendor.id, name), name, nozzle: 0.4, required: false, machine,
      processes: ['fine', 'standard', 'draft'].filter(rung => processPick[rung]).map(rung =>
        ({ id: rung, name: RUNGS[rung].name, ladder: rung, preset: processPick[rung] })),
      filaments: TYPES.filter(type => filamentPick[type]).map(type =>
        ({ id: type.toLowerCase(), name: `Generic ${type}`, type, preset: filamentPick[type] })),
      fixups: fixupsFor(vendor) });
  }
  report.generated = models.length;
  return { report, vendor: { id: vendor.id, name: vendor.name, source: vendor.source, models } };
}

async function main() {
  const { values } = parseArgs({ options: { vendors: { type: 'string' }, output: { type: 'string', default: GENERATED_CONFIG } } });
  const { config: curatedConfig, curated } = await loadCatalogConfig({ generatedPath: '.no-generated-config' });
  assertPinnedSource(curated.source);
  const wanted = values.vendors?.split(',');
  const acquirer = createAcquirer({ commit: curated.source.commit, cacheDir: EXPLORE_DIR });
  await acquirer.init();
  const resolver = createPresetSource({ indexDir: EXPLORE_DIR, presetDir: EXPLORE_DIR });
  const vendors = []; const reports = [];
  for (const vendor of VENDORS.filter(entry => !wanted || wanted.includes(entry.id))) {
    let result;
    try { result = await generateVendor(vendor, acquirer, resolver); } catch (error) {
      reports.push({ vendor: vendor.id, attempted: 0, generated: 0, skipped: { [`vendor unavailable: ${error.message}`]: 1 } });
      continue;
    }
    reports.push(result.report);
    const curatedMachines = new Set(curatedConfig.vendors.filter(entry => entry.source === vendor.source)
      .flatMap(entry => entry.models.map(model => model.machine)));
    const models = result.vendor.models.filter(model => !curatedMachines.has(model.machine));
    if (models.length) vendors.push({ ...result.vendor, models });
    console.log(`${vendor.id}: attempted ${result.report.attempted}, generated ${models.length}`, JSON.stringify(result.report.skipped));
  }
  await writeFile(values.output, `${JSON.stringify({ schema: 1, source: curated.source, generatedFrom: CURATED_CONFIG, vendors }, null, 1)}\n`);
  await mkdir('.engine-cache', { recursive: true });
  await writeFile('.engine-cache/catalog-generate-report.json', `${JSON.stringify(reports, null, 2)}\n`);
  console.log(`Generated ${vendors.reduce((sum, vendor) => sum + vendor.models.length, 0)} models in ${values.output}`);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
