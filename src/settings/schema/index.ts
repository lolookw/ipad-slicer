export const SCHEMA_VERSION = 1;
export const OBSOLETE_SETTINGS = new Set(['adaptive_layer_height']);

export const SUPPORT_TYPES = ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'] as const;
export const BRIM_TYPES = ['auto_brim', 'brim_ears', 'painted', 'outer_only', 'inner_only', 'outer_and_inner', 'no_brim'] as const;
export const INFILL_PATTERNS = [
  'rectilinear', 'alignedrectilinear', 'zigzag', 'crosszag', 'lockedzag', 'line', 'grid', 'triangles',
  'tri-hexagon', 'cubic', 'adaptivecubic', 'quartercubic', 'supportcubic', 'lightning', 'honeycomb',
  '3dhoneycomb', 'lateral-honeycomb', 'lateral-lattice', 'crosshatch', 'tpmsd', 'tpmsfk', 'gyroid',
  'concentric', 'hilbertcurve', 'archimedeanchords', 'octagramspiral',
] as const;
export const BED_TYPES = ['Cool Plate', 'Engineering Plate', 'High Temp Plate', 'Textured PEI Plate', 'Textured Cool Plate', 'Supertack Plate'] as const;
export const GCODE_FLAVORS = ['marlin', 'klipper', 'reprapfirmware', 'repetier', 'marlin2'] as const;
export const IRONING_TYPES = ['no ironing', 'top', 'topmost', 'solid'] as const;
export const SEAM_POSITIONS = ['nearest', 'aligned', 'aligned_back', 'back', 'random'] as const;
export const FUZZY_SKINS = ['none', 'external', 'hole', 'all', 'allwalls', 'disabled_fuzzy'] as const;

export type SettingType = 'float' | 'int' | 'percent' | 'bool' | 'enum' | 'string' | 'gcode';
export type SettingValue = number | boolean | string | (number | boolean | string)[];
export interface SettingDef {
  key: string;
  type: SettingType;
  vector?: 'filament' | 'extruder';
  enum?: readonly string[];
  min?: number;
  max?: number;
  tier: 'simple' | 'advanced' | 'expert';
  category: 'quality' | 'strength' | 'speed' | 'support' | 'adhesion' | 'cooling' | 'retraction' | 'machine' | 'others';
  labelKey: `settings.${string}.label`;
}

const define = <T extends Record<string, Omit<SettingDef, 'key'>>>(values: T) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { key, ...value }])) as { [K in keyof T]: SettingDef & { key: K } };
type SettingExtras = Omit<Partial<SettingDef>, 'labelKey'> & { labelKey: string };
const simple = (type: SettingType, category: SettingDef['category'], extra: SettingExtras) => {
  const { labelKey, ...rest } = extra;
  return { type, category, tier: 'simple' as const, labelKey: `settings.${labelKey}.label` as SettingDef['labelKey'], ...rest };
};
const advanced = (type: SettingType, category: SettingDef['category'], extra: SettingExtras) => ({ ...simple(type, category, extra), tier: 'advanced' as const });

export const SETTINGS = define({
  layer_height: simple('float', 'quality', { min: 0, labelKey: 'layerHeight' }),
  initial_layer_print_height: simple('float', 'quality', { min: 0, labelKey: 'initialLayerHeight' }),
  wall_loops: simple('int', 'strength', { min: 0, max: 1000, labelKey: 'wallLoops' }),
  top_shell_layers: simple('int', 'strength', { min: 0, labelKey: 'topLayers' }),
  bottom_shell_layers: simple('int', 'strength', { min: 0, labelKey: 'bottomLayers' }),
  sparse_infill_density: simple('percent', 'strength', { min: 0, max: 100, labelKey: 'infillDensity' }),
  sparse_infill_pattern: simple('enum', 'strength', { enum: INFILL_PATTERNS, labelKey: 'infillPattern' }),
  enable_support: simple('bool', 'support', { labelKey: 'supports' }),
  support_type: simple('enum', 'support', { enum: SUPPORT_TYPES, labelKey: 'supportType' }),
  support_threshold_angle: simple('int', 'support', { min: 0, max: 90, labelKey: 'supportAngle' }),
  support_on_build_plate_only: simple('bool', 'support', { labelKey: 'buildPlateOnly' }),
  brim_type: simple('enum', 'adhesion', { enum: BRIM_TYPES, labelKey: 'brimType' }),
  brim_width: simple('float', 'adhesion', { min: 0, max: 100, labelKey: 'brimWidth' }),
  curr_bed_type: simple('enum', 'machine', { enum: BED_TYPES, labelKey: 'bedType' }),
  nozzle_temperature: simple('int', 'others', { vector: 'filament', min: 0, max: 1500, labelKey: 'nozzleTemperature' }),
  nozzle_temperature_initial_layer: simple('int', 'others', { vector: 'filament', min: 0, max: 1500, labelKey: 'initialNozzleTemperature' }),
  cool_plate_temp: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'bedTemperature' }),
  cool_plate_temp_initial_layer: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'initialBedTemperature' }),
  eng_plate_temp: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'bedTemperature' }),
  eng_plate_temp_initial_layer: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'initialBedTemperature' }),
  hot_plate_temp: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'bedTemperature' }),
  hot_plate_temp_initial_layer: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'initialBedTemperature' }),
  textured_plate_temp: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'bedTemperature' }),
  textured_plate_temp_initial_layer: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'initialBedTemperature' }),
  textured_cool_plate_temp: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'bedTemperature' }),
  textured_cool_plate_temp_initial_layer: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'initialBedTemperature' }),
  supertack_plate_temp: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'bedTemperature' }),
  supertack_plate_temp_initial_layer: simple('int', 'machine', { vector: 'filament', min: 0, max: 300, labelKey: 'initialBedTemperature' }),
  nozzle_diameter: advanced('float', 'machine', { vector: 'extruder', min: 0.1, max: 2, labelKey: 'nozzleDiameter' }),
  printable_height: advanced('float', 'machine', { min: 1, max: 2000, labelKey: 'printableHeight' }),
  printable_area: advanced('string', 'machine', { vector: 'extruder', labelKey: 'printableArea' }),
  outer_wall_speed: advanced('float', 'speed', { min: 1, labelKey: 'outerWallSpeed' }),
  inner_wall_speed: advanced('float', 'speed', { min: 1, labelKey: 'innerWallSpeed' }),
  sparse_infill_speed: advanced('float', 'speed', { min: 1, labelKey: 'infillSpeed' }),
  travel_speed: advanced('float', 'speed', { min: 1, labelKey: 'travelSpeed' }),
  initial_layer_speed: advanced('float', 'speed', { min: 1, labelKey: 'initialLayerSpeed' }),
  ironing_type: advanced('enum', 'quality', { enum: IRONING_TYPES, labelKey: 'ironingType' }),
  seam_position: advanced('enum', 'quality', { enum: SEAM_POSITIONS, labelKey: 'seamPosition' }),
  fuzzy_skin: advanced('enum', 'others', { enum: FUZZY_SKINS, labelKey: 'fuzzySkin' }),
  use_relative_e_distances: advanced('bool', 'machine', { labelKey: 'relativeExtrusion' }),
  gcode_flavor: advanced('enum', 'machine', { enum: GCODE_FLAVORS, labelKey: 'gcodeFlavor' }),
  before_layer_change_gcode: advanced('gcode', 'machine', { labelKey: 'beforeLayerGcode' }),
  layer_change_gcode: advanced('gcode', 'machine', { labelKey: 'layerChangeGcode' }),
  machine_start_gcode: advanced('gcode', 'machine', { labelKey: 'startGcode' }),
  machine_end_gcode: advanced('gcode', 'machine', { labelKey: 'endGcode' }),
  filament_cost: advanced('float', 'others', { vector: 'filament', min: 0, labelKey: 'filamentCost' }),
  filament_density: advanced('float', 'others', { vector: 'filament', min: 0, labelKey: 'filamentDensity' }),
});

export type SettingKey = keyof typeof SETTINGS;
export function isSettingKey(key: string): key is SettingKey { return key in SETTINGS; }
