import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

export const METADATA_KEYS = new Set([
  'type', 'name', 'inherits', 'from', 'setting_id', 'instantiation', 'filament_id', 'description',
  'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition',
]);

function splitPreset(resolved, chain) {
  const settings = {};
  for (const [key, value] of Object.entries(resolved)) if (!METADATA_KEYS.has(key)) settings[key] = value;
  return {
    settings,
    meta: {
      chain,
      compatiblePrinters: resolved.compatible_printers,
      compatiblePrintersCondition: resolved.compatible_printers_condition,
      compatiblePrints: resolved.compatible_prints,
      compatiblePrintsCondition: resolved.compatible_prints_condition,
    },
  };
}

export function createPresetSource({
  indexDir = '.engine-cache/orca-profiles-v2.4.2', presetDir = '.engine-cache/orca-profiles-v2.4.2',
} = {}) {
  const indexCache = new Map();
  async function indexFor(vendor) {
    if (!indexCache.has(vendor)) {
      const candidates = [`index-${vendor}.json`, `${vendor}.json`];
      let text;
      for (const candidate of candidates) {
        try { text = await readFile(join(indexDir, candidate), 'utf8'); break; } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      if (!text) throw new Error(`Pinned vendor index is unavailable: ${vendor}`);
      indexCache.set(vendor, JSON.parse(text));
    }
    return indexCache.get(vendor);
  }

  async function load(vendor, kind, name) {
    const index = await indexFor(vendor);
    const entry = index[`${kind}_list`]?.find(candidate => candidate.name === name);
    if (!entry) throw new Error(`${vendor} ${kind} preset is not indexed: ${name}`);
    const path = join(presetDir, `${vendor}__${entry.sub_path.replaceAll('/', '__')}`);
    let value;
    try { value = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Pinned preset payload is unavailable: ${vendor}/${entry.sub_path}`);
      throw error;
    }
    if (value.name !== name) throw new Error(`Preset ${entry.sub_path} declares ${value.name}, expected ${name}`);
    return value;
  }

  return {
    async resolve(vendor, kind, name) {
      const presets = [];
      for (let current = name; current;) {
        if (presets.some(preset => preset.name === current)) throw new Error(`Inheritance cycle at ${current}`);
        const preset = await load(vendor, kind, current);
        presets.unshift(preset);
        current = preset.inherits;
      }
      return splitPreset(Object.assign({}, ...presets), presets.map(preset => preset.name));
    },
  };
}

export async function mergeSelection(source, selection, fixups = {}) {
  const machine = await source.resolve(selection.vendor, 'machine', selection.machine);
  const process = await source.resolve(selection.vendor, 'process', selection.process);
  const filament = await source.resolve(selection.vendor, 'filament', selection.filament);
  return {
    settings: {
      ...machine.settings, ...process.settings, ...filament.settings, ...fixups,
      printer_settings_id: selection.machine,
      print_settings_id: selection.process,
      filament_settings_id: [selection.filament],
    },
    meta: { machine: machine.meta, process: process.meta, filament: filament.meta },
  };
}

async function main() {
  const { values } = parseArgs({ options: {
    vendor: { type: 'string', default: 'Creality' },
    machine: { type: 'string', default: 'Creality Ender-3 V2 0.4 nozzle' },
    process: { type: 'string', default: '0.20mm Standard @Creality Ender3V2' },
    filament: { type: 'string', default: 'Creality Generic PLA' },
    output: { type: 'string', default: 'profiles/ender3v2-020-pla.json' },
  } });
  const resolved = await mergeSelection(createPresetSource(), values, { use_relative_e_distances: '1' });
  const sorted = Object.fromEntries(Object.entries(resolved.settings).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(join(values.output, '..'), { recursive: true }).catch(() => undefined);
  await writeFile(values.output, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Wrote ${basename(values.output)} with ${Object.keys(sorted).length} native settings`);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
