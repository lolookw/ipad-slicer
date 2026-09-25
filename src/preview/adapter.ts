import type {
  GcodePreviewElement, GcodePreviewSource, GcodePreviewControls, GcodePreviewState, PreviewEvent,
} from '@chestnutlabs/gcode-preview-element';
// The library family's own doc comment on `hiddenFeatureRoles` says to import the numeric role
// codes from here. This stays the ONLY other `@chestnutlabs/*` import in this file (still a single
// boundary): every other new type below is derived structurally from the one declared dependency.
import { FeatureRole, type FeatureRoleValue } from '@chestnutlabs/toolpath-core';

export type LayerRange = [number, number] | null;
export type PreviewElement = HTMLElement & Pick<GcodePreviewElement,
  'source' | 'quality' | 'layerRange' | 'adjacentLayers' | 'progressivePreview'
  | 'colorMode' | 'hiddenFeatureRoles' | 'showTravel' | 'showWipe' | 'showRetractions'
  | 'view' | 'cameraMode' | 'cameraState' | 'buildVolume' | 'state' | 'controls' | 'capture' | 'onEvent'>;

/** The capability-honest list a file can ever offer (`state.availableColorModes` filters it further). */
export type ColorModeName = GcodePreviewState['availableColorModes'][number];
export type CameraView = Parameters<GcodePreviewControls['setView']>[0];
export type CameraMode = Parameters<GcodePreviewControls['setCameraMode']>[0];
export type CameraState = NonNullable<ReturnType<GcodePreviewControls['getCameraState']>>;
export type CaptureOptions = NonNullable<Parameters<GcodePreviewControls['capture']>[0]>;
export type PreviewState = GcodePreviewState;
export type { FeatureRoleValue, PreviewEvent };
type ColorModeArg = Parameters<GcodePreviewControls['setColorMode']>[0];
/**
 * The element's `buildVolume` setter also accepts a discovered `MachineGeometry` (an OrcaSlicer
 * `; printable_area` comment auto-detected from the file text); narrowed structurally to the plain
 * `BuildVolumeDef` shape this app always supplies explicitly (DD-030: `x`/`y`/`z` in millimeters,
 * corner-origin — `min` defaults to `{x:0,y:0}` — the SAME absolute coordinate space OrcaSlicer's
 * G-code itself uses, never this app's own centered display convention).
 */
export type PreviewBuildVolume = Extract<PreviewElement['buildVolume'], { x: number }>;
type RGB = [number, number, number];

export interface PreviewOptions {
  source: GcodePreviewSource;
  layerRange?: LayerRange;
  /** The machine's real bed/build volume (see {@link PreviewBuildVolume}). Unset draws no plate at
   *  all, and the toolpath still renders at its true G-code coordinates with nothing to frame it. */
  buildVolume?: PreviewBuildVolume;
  /** Initial shading; forwarded as a fully-built library `ColorMode` (see {@link buildColorMode}). */
  colorMode?: ColorModeName;
  /** Feature roles hidden from the very first frame (declutter, e.g. Skirt/Brim/Support). */
  hiddenFeatureRoles?: readonly FeatureRoleValue[];
  /** Defaults match the element's own: travel/wipe visible, retractions hidden. */
  showTravel?: boolean;
  showWipe?: boolean;
  showRetractions?: boolean;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

// Mutable bytes belong to the preview; immutable File instances may be shared.
function ownedSource(source: GcodePreviewSource): GcodePreviewSource {
  return source instanceof Uint8Array || source instanceof ArrayBuffer ? source.slice() : source;
}

async function loadElement(): Promise<PreviewElement> {
  const { defineGcodePreview } = await import('@chestnutlabs/gcode-preview-element');
  defineGcodePreview();
  return document.createElement('gcode-preview') as GcodePreviewElement;
}

/**
 * Color palettes/ramps (DD-014 D3 honesty model: unknown values fall back, never a fabricated
 * color). These are visual defaults owned by this app, not the library — real-slicer-convention
 * hues (Orca/PrusaSlicer-like "Feature type" colors for the feature legend; a blue→red thermal
 * ramp for Speed/Height).
 */
const NEUTRAL: RGB = [0.65, 0.65, 0.65];
const SINGLE_COLOR: RGB = [0.20, 0.55, 0.95];
const TRAVEL_COLOR: RGB = [0.85, 0.20, 0.20];
const SPEED_RAMP: RGB[] = [[0.15, 0.25, 0.85], [0.15, 0.75, 0.85], [0.25, 0.80, 0.25], [0.95, 0.85, 0.15], [0.90, 0.15, 0.15]];
const HEIGHT_RAMP: RGB[] = [[0.05, 0.05, 0.45], [0.05, 0.45, 0.55], [0.35, 0.75, 0.35], [0.95, 0.85, 0.20], [0.95, 0.35, 0.15]];
/** Distinct-per-index color for object/tool/color-change modes (any plate size, no hardcoded cap). */
const OBJECT_PALETTE_SIZE = 16;
const GOLDEN_ANGLE_DEG = 137.508;

export interface FeatureRoleSwatch { role: FeatureRoleValue; key: string; color: RGB }
/** The "Feature type" legend/palette (Orca/PrusaSlicer convention). `Unknown` has no dedicated
 *  color — unknown/unlabeled extrusion degrades to the mode's fallback, honestly. */
export const FEATURE_LEGEND: readonly FeatureRoleSwatch[] = [
  { role: FeatureRole.Perimeter, key: 'perimeter', color: [0.95, 0.55, 0.10] },
  { role: FeatureRole.ExternalPerimeter, key: 'externalPerimeter', color: [0.90, 0.25, 0.10] },
  { role: FeatureRole.Infill, key: 'infill', color: [0.95, 0.80, 0.15] },
  { role: FeatureRole.SolidInfill, key: 'solidInfill', color: [0.85, 0.60, 0.05] },
  { role: FeatureRole.Support, key: 'support', color: [0.10, 0.65, 0.65] },
  { role: FeatureRole.Skirt, key: 'skirt', color: [0.55, 0.55, 0.55] },
  { role: FeatureRole.Brim, key: 'brim', color: [0.35, 0.35, 0.35] },
  { role: FeatureRole.Bridge, key: 'bridge', color: [0.20, 0.45, 0.90] },
  { role: FeatureRole.Travel, key: 'travel', color: [0.75, 0.75, 0.75] },
  { role: FeatureRole.PrimeTower, key: 'primeTower', color: [0.55, 0.25, 0.80] },
  { role: FeatureRole.WipeTower, key: 'wipeTower', color: [0.80, 0.20, 0.60] },
  { role: FeatureRole.Raft, key: 'raft', color: [0.55, 0.35, 0.15] },
  { role: FeatureRole.Purge, key: 'purge', color: [0.95, 0.45, 0.65] },
];
/** The declutter row (task: "hide Skirt+Brim+Support at minimum"). Reuses the legend's own labels/colors. */
export const DECLUTTER_ROLES: readonly FeatureRoleSwatch[] =
  FEATURE_LEGEND.filter(entry => entry.role === FeatureRole.Skirt || entry.role === FeatureRole.Brim || entry.role === FeatureRole.Support);

function featurePalette(): RGB[] {
  const palette: RGB[] = new Array(15).fill(NEUTRAL) as RGB[];
  for (const entry of FEATURE_LEGEND) palette[entry.role] = entry.color;
  return palette;
}

/** HSL→RGB (0..1) for a procedural, any-size palette. Pure. */
export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r1! + m, g1! + m, b1! + m];
}

/** Golden-angle hue rotation: `count` visually distinct colors for any plate/tool/swap count. Pure. */
export function proceduralPalette(count: number): RGB[] {
  const size = Math.max(1, Math.floor(count));
  return Array.from({ length: size }, (_, index) => hslToRgb(index * GOLDEN_ANGLE_DEG, 0.62, 0.55));
}

/**
 * Builds the full library `ColorMode` for a bare capability name (from `state.availableColorModes`)
 * — the UI only ever picks a name; this is the one place that owns palettes/ramps/fallbacks, so a
 * consumer component never constructs a `ColorMode` object itself. Pure.
 */
export function buildColorMode(name: ColorModeName): ColorModeArg {
  switch (name) {
    case 'feature': return { mode: 'feature', palette: featurePalette(), fallback: NEUTRAL };
    case 'feedrate': return { mode: 'feedrate', ramp: SPEED_RAMP, fallback: NEUTRAL };
    case 'layerHeight': return { mode: 'layerHeight', ramp: HEIGHT_RAMP, fallback: NEUTRAL };
    case 'object': return { mode: 'object', palette: proceduralPalette(OBJECT_PALETTE_SIZE), fallback: NEUTRAL };
    case 'tool': return { mode: 'tool', palette: proceduralPalette(OBJECT_PALETTE_SIZE), fallback: NEUTRAL };
    case 'colorChange': return { mode: 'colorChange', palette: proceduralPalette(OBJECT_PALETTE_SIZE), fallback: NEUTRAL };
    case 'filament': return { mode: 'filament', fallback: NEUTRAL };
    case 'moveKind': return { mode: 'moveKind', cut: SPEED_RAMP[4]!, travel: TRAVEL_COLOR, fallback: SINGLE_COLOR };
    case 'power': return { mode: 'power', ramp: SPEED_RAMP, fallback: NEUTRAL };
    case 'single': default: return { mode: 'single', color: SINGLE_COLOR };
  }
}

/** RGB (0..1 floats) → a CSS `rgb()` string, for legend swatches. Pure. */
export function rgbToCss([r, g, b]: RGB): string {
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
  return `rgb(${byte(r)}, ${byte(g)}, ${byte(b)})`;
}

function applyInitialOptions(element: PreviewElement, options: PreviewOptions): void {
  element.quality = 'lines';
  element.adjacentLayers = 0;
  element.progressivePreview = 'off';
  element.layerRange = options.layerRange ? [...options.layerRange] : null;
  if (options.buildVolume) element.buildVolume = options.buildVolume;
  if (options.colorMode) element.colorMode = buildColorMode(options.colorMode);
  if (options.hiddenFeatureRoles?.length) element.hiddenFeatureRoles = [...options.hiddenFeatureRoles];
  if (options.showTravel !== undefined) element.showTravel = options.showTravel;
  if (options.showWipe !== undefined) element.showWipe = options.showWipe;
  if (options.showRetractions !== undefined) element.showRetractions = options.showRetractions;
}

/** Property boundary only: 0.20.1 layer ranges clip draws, not GPU allocations. */
export async function createPreviewAdapter(
  host: HTMLElement,
  options: PreviewOptions,
  createElement: () => Promise<PreviewElement> = loadElement,
) {
  const element = await createElement();
  applyInitialOptions(element, options);
  element.source = ownedSource(options.source);
  host.append(element);

  // Native context events do not bubble or cross the package's open shadow root.
  const canvas = element.shadowRoot?.querySelector('canvas');
  const lost = (event: Event) => {
    event.preventDefault();
    options.onContextLost?.();
  };
  const restored = () => options.onContextRestored?.();
  canvas?.addEventListener('webglcontextlost', lost);
  canvas?.addEventListener('webglcontextrestored', restored);
  let disposed = false;

  return {
    setLayerRange(range: LayerRange) {
      if (!disposed) element.layerRange = range ? [...range] : null;
    },
    /** Budget rungs shrink the source itself: the library only clips draws, it never frees buffers. */
    setSource(source: GcodePreviewSource, range: LayerRange = null) {
      if (disposed) return;
      element.layerRange = null; // never pair a stale range with a different text
      element.source = ownedSource(source);
      element.layerRange = range ? [...range] : null;
    },
    /** Only ever call with a name from `getState().availableColorModes` (capability-honest gate). */
    setColorMode(name: ColorModeName) {
      if (!disposed) element.colorMode = buildColorMode(name);
    },
    /** Re-applies the configured machine bed (e.g. after the printer profile changes). */
    setBuildVolume(volume: PreviewBuildVolume) {
      if (!disposed) element.buildVolume = volume;
    },
    /** Declarative diff against the element's own `hiddenFeatureRoles` (DD-031 G3): pass the full
     *  set of roles that should be hidden right now. */
    setHiddenFeatureRoles(roles: readonly FeatureRoleValue[]) {
      // An empty array and `null` are equivalent to the element (both clear every hidden role);
      // the non-nullable array keeps this call's own type simple.
      if (!disposed) element.hiddenFeatureRoles = [...roles];
    },
    setShowTravel(visible: boolean) { if (!disposed) element.showTravel = visible; },
    setShowWipe(visible: boolean) { if (!disposed) element.showWipe = visible; },
    setShowRetractions(visible: boolean) { if (!disposed) element.showRetractions = visible; },
    setView(view: CameraView) { if (!disposed) element.view = view; },
    setCameraMode(mode: CameraMode) { if (!disposed) element.cameraMode = mode; },
    /** "Fit"/frame-everything — no property form exists for this one command. */
    frame() { if (!disposed) element.controls.frame(); },
    getCameraState(): CameraState | null { return disposed ? null : element.cameraState; },
    setCameraState(state: CameraState) { if (!disposed) element.cameraState = state; },
    /** Save-preview-image passthrough (DD-030 D1); the caller owns the returned Blob. */
    capture(opts?: CaptureOptions): Promise<Blob> { return element.capture(opts); },
    getState(): PreviewState { return element.state; },
    onEvent(cb: (event: PreviewEvent) => void): () => void { return element.onEvent(cb); },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas?.removeEventListener('webglcontextlost', lost);
      canvas?.removeEventListener('webglcontextrestored', restored);
      // disconnectedCallback owns controller/renderer disposal; no public dispose exists.
      element.remove();
      element.source = null;
    },
  };
}
