import type { PreviewPlan } from './budget';
import type { LayerRange } from './adapter';

/**
 * Pure, byte-level layer filtering for OrcaSlicer G-code (`;LAYER_CHANGE` + `;Z:` markers).
 *
 * The preview library only clips draws when `layerRange` changes; it never frees GPU buffers.
 * The budget rungs therefore have to shrink the TEXT handed to the element. Extraction relies on
 * the engine's relative extrusion (M83) and absolute XY/Z moves, so any subset of whole layers is
 * self-contained for a lines-only preview. Nothing here ever touches the bytes that Save exports.
 */

export interface GcodeLayerIndex {
  layerCount: number;
  /** Byte offset of each `;LAYER_CHANGE` line. */
  layerStarts: number[];
  /** Z height from the `;Z:` line right after each marker, when present. */
  layerZ: (number | undefined)[];
  /** Byte offset where the last layer stops: `; EXECUTABLE_BLOCK_END`, or end of data. */
  bodyEnd: number;
}

const encoder = new TextEncoder();
const LAYER_MARK = encoder.encode(';LAYER_CHANGE');
const Z_MARK = encoder.encode(';Z:');
const END_MARK = encoder.encode('; EXECUTABLE_BLOCK_END');
const NEWLINE = 10;
const END_LINE = encoder.encode('; EXECUTABLE_BLOCK_END\n');
// Modal commands later layers depend on. The start section's prime line would otherwise become a
// stray extra "layer 0" in the library's own layer table, so windows that skip layer 0 drop it.
const MODAL = new Set(['G20', 'G21', 'G90', 'G91', 'M82', 'M83']);

export function toGcodeBytes(gcode: Uint8Array | ArrayBuffer | string): Uint8Array {
  return typeof gcode === 'string' ? encoder.encode(gcode) : gcode instanceof Uint8Array ? gcode : new Uint8Array(gcode);
}

function startsWith(bytes: Uint8Array, at: number, mark: Uint8Array): boolean {
  if (at + mark.length > bytes.length) return false;
  for (let i = 0; i < mark.length; i++) if (bytes[at + i] !== mark[i]) return false;
  return true;
}

function parseZ(bytes: Uint8Array, at: number): number | undefined {
  if (!startsWith(bytes, at, Z_MARK)) return undefined;
  let end = bytes.indexOf(NEWLINE, at);
  if (end < 0) end = bytes.length;
  const text = new TextDecoder().decode(bytes.subarray(at + Z_MARK.length, end)).trim();
  const value = Number(text);
  return text !== '' && Number.isFinite(value) ? value : undefined;
}

/** One pass over line starts; never decodes the whole file. */
export function indexGcodeLayers(bytes: Uint8Array): GcodeLayerIndex {
  const layerStarts: number[] = [];
  const layerZ: (number | undefined)[] = [];
  let bodyEnd = bytes.length;
  let pending = -1; // marker whose Z line is the next line
  let at = 0;
  while (at < bytes.length) {
    let next = bytes.indexOf(NEWLINE, at);
    next = next < 0 ? bytes.length : next + 1;
    if (pending >= 0) { layerZ[pending] = parseZ(bytes, at); pending = -1; }
    if (bytes[at] === 59 /* ; */) {
      if (startsWith(bytes, at, LAYER_MARK)) {
        const after = bytes[at + LAYER_MARK.length];
        if (after === undefined || after === NEWLINE || after === 13 || after === 32) {
          pending = layerStarts.length; layerStarts.push(at); layerZ.push(undefined);
        }
      } else if (layerStarts.length > 0 && startsWith(bytes, at, END_MARK)) {
        bodyEnd = at; break;
      }
    }
    at = next;
  }
  return { layerCount: layerStarts.length, layerStarts, layerZ, bodyEnd };
}

/**
 * Start section (header, prime, start G-code) + layers `start..end` (inclusive, 0-based, clamped)
 * + a minimal end marker. Without layer markers the text is returned as an untouched copy.
 */
export function extractLayers(bytes: Uint8Array, index: GcodeLayerIndex, start: number, end: number): Uint8Array {
  if (index.layerCount === 0) return bytes.slice();
  const first = Math.max(0, Math.floor(start));
  const last = Math.min(index.layerCount - 1, Math.floor(end));
  const start0 = bytes.subarray(0, index.layerStarts[0]);
  const head = first === 0 ? start0 : modalLines(start0);
  if (!(first <= last)) return joinChunks([head, END_LINE]);
  const from = index.layerStarts[first]!;
  const to = last + 1 < index.layerCount ? index.layerStarts[last + 1]! : index.bodyEnd;
  return joinChunks([head, bytes.subarray(from, to), END_LINE]);
}

function modalLines(section: Uint8Array): Uint8Array {
  const kept: string[] = [];
  for (const line of new TextDecoder().decode(section).split('\n')) {
    const command = line.trim().split(/[\s;]/, 1)[0]?.toUpperCase();
    if (command && MODAL.has(command)) kept.push(command);
  }
  return encoder.encode(kept.length ? `${kept.join('\n')}\n` : '');
}

function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

export interface PreviewSource { bytes: Uint8Array; layerRange: LayerRange }

/**
 * What the element must receive for a budget rung, or null when the preview is unavailable.
 *
 * - all-visible: the untouched text, drawn 0..current (the slider shows layers 1..N).
 * - window: only layers `plan.layerRange[0]..current`; every layer of the filtered text is drawn,
 *   so no library layer indices are involved.
 * - decimated: line-level decimation of a window is not attempted (it would leave broken paths
 *   and cannot be checked without a device); this rung falls back to the current layer alone.
 */
export function previewSourceFor(bytes: Uint8Array, index: GcodeLayerIndex, plan: PreviewPlan, currentLayer: number): PreviewSource | null {
  const current = Math.max(0, Math.min(Math.max(0, index.layerCount - 1), Math.floor(currentLayer)));
  switch (plan.stage) {
    // Without layer markers the library's own layer table is unknown: show everything.
    case 'all-visible': return { bytes, layerRange: index.layerCount > 0 ? [0, current] : null };
    case 'window': return { bytes: extractLayers(bytes, index, plan.layerRange?.[0] ?? current, current), layerRange: null };
    case 'decimated': return { bytes: extractLayers(bytes, index, current, current), layerRange: null };
    default: return null;
  }
}
