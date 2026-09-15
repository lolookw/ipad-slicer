// Resolves pinned OrcaSlicer presets into one flat `orca.native-json` config for onewasm_init.
// Each preset follows its `inherits` chain by preset name; child keys override parent keys.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ORCA_TAG = 'v2.4.2';
const RAW_BASE = `https://raw.githubusercontent.com/OrcaSlicer/OrcaSlicer/${ORCA_TAG}/resources/profiles`;
const CACHE_DIR = `.engine-cache/orca-profiles-${ORCA_TAG}`;
const OUTPUT = 'profiles/ender3v2-020-pla.json';

// Preset name -> repository path. Names differ from file names, so the map is explicit.
const PRESETS = {
  'Creality Ender-3 V2 0.4 nozzle': 'Creality/machine/Creality Ender-3 V2 0.4 nozzle.json',
  fdm_creality_common: 'Creality/machine/fdm_creality_common.json',
  fdm_machine_common: 'Creality/machine/fdm_machine_common.json',
  '0.20mm Standard @Creality Ender3V2': 'Creality/process/0.20mm Standard @Creality Ender3V2.json',
  fdm_process_creality_common: 'Creality/process/fdm_process_creality_common.json',
  fdm_process_common: 'Creality/process/fdm_process_common.json',
  'Creality Generic PLA': 'Creality/filament/Creality Generic PLA.json',
  fdm_filament_pla: 'Creality/filament/fdm_filament_pla.json',
  fdm_filament_common: 'Creality/filament/fdm_filament_common.json',
};

const SELECTION = {
  machine: 'Creality Ender-3 V2 0.4 nozzle',
  process: '0.20mm Standard @Creality Ender3V2',
  filament: 'Creality Generic PLA',
};

// Preset bookkeeping keys that are not slicing settings.
const METADATA_KEYS = new Set([
  'type', 'name', 'inherits', 'from', 'setting_id', 'instantiation', 'filament_id', 'description',
  'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition',
]);

async function loadPreset(name) {
  const path = PRESETS[name];
  if (!path) throw new Error(`Preset "${name}" is not pinned in PRESETS`);
  const cached = `${CACHE_DIR}/${path.replaceAll('/', '__')}`;
  let text;
  try {
    text = await readFile(cached, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(`${RAW_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok) throw new Error(`Download failed for "${name}" (${response.status})`);
    text = await response.text();
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cached, text);
  }
  const preset = JSON.parse(text);
  if (preset.name !== name) throw new Error(`Expected preset "${name}" but ${path} declares "${preset.name}"`);
  return preset;
}

async function resolveChain(name) {
  const chain = [];
  for (let current = name; current; ) {
    if (chain.some((preset) => preset.name === current)) throw new Error(`Inheritance cycle at "${current}"`);
    const preset = await loadPreset(current);
    chain.unshift(preset);
    current = preset.inherits;
  }
  return Object.assign({}, ...chain);
}

const config = {};
for (const [kind, name] of Object.entries(SELECTION)) {
  const resolved = await resolveChain(name);
  for (const [key, value] of Object.entries(resolved)) {
    if (!METADATA_KEYS.has(key)) config[key] = value;
  }
  config[`${kind === 'machine' ? 'printer' : kind === 'process' ? 'print' : 'filament'}_settings_id`] =
    kind === 'filament' ? [name] : name;
}

// The Creality start G-code sets relative extrusion (M83) and the inherited before-layer-change
// G-code runs `G92 E0`; the engine rejects that pairing unless relative E distances are enabled.
const OVERRIDES = { use_relative_e_distances: '1' };

const sorted = Object.fromEntries(
  Object.entries({ ...config, ...OVERRIDES }).sort(([a], [b]) => a.localeCompare(b)),
);
await mkdir('profiles', { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${OUTPUT} with ${Object.keys(sorted).length} keys from OrcaSlicer ${ORCA_TAG}`);
