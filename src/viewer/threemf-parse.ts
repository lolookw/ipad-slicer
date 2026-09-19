import { unzipSync } from 'fflate';
import type { MeshBuffers } from './geometry-cache';
import type { ImportedObject, ImportModelResult, ObjectMaterial } from './import-types';
import { scanXml } from './xml-scan';
import type { CodedError, ErrorCode } from '../i18n/en';

export interface Parse3mfOptions {
  /** Upper bound on triangles, used to refuse oversized files before allocating mesh buffers. */
  maxTriangles?: number;
}

class ThreeMfError extends Error {
  constructor(readonly code: ErrorCode, readonly values?: Record<string, string | number>) { super(code); }
}

/** Affine transform in the 3MF row-vector layout: [m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32]. */
type Affine = readonly number[];
const IDENTITY: Affine = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

const UNIT_TO_MM: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const MAX_PART_BYTES = 256 * 1024 * 1024;
const MAX_COMPONENT_DEPTH = 32;
const MAX_MATERIALS = 16;
const CONFIG_PARTS = new Set(['metadata/model_settings.config', 'metadata/slic3r_pe_model.config']);
const DEFAULT_MODEL_PART = '3d/3dmodel.model';

/** Applies `first`, then `second` (row-vector convention). */
function compose(first: Affine, second: Affine): Affine {
  const a = first, b = second;
  const row = (r: number, c: number) => a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  return [
    row(0, 0), row(0, 1), row(0, 2),
    row(1, 0), row(1, 1), row(1, 2),
    row(2, 0), row(2, 1), row(2, 2),
    row(3, 0) + b[9]!, row(3, 1) + b[10]!, row(3, 2) + b[11]!,
  ];
}

function determinant(m: Affine): number {
  return m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
}

function parseTransform(text: string | undefined): Affine {
  if (!text) return IDENTITY;
  const values = text.trim().split(/\s+/).map(Number);
  if (values.length !== 12 || !values.every(Number.isFinite)) throw new ThreeMfError('threemf-invalid-format');
  return values;
}

function normalizePath(path: string): string { return path.replace(/^\/+/, '').toLowerCase(); }

interface MeshData { vertices: number[]; triangles: number[]; materialKeys: Set<string> }
interface ComponentRef { objectId: string; path: string | undefined; transform: Affine }
interface ModelObject {
  id: string; name: string | undefined; type: string; pid: string | undefined; pindex: string | undefined;
  mesh: MeshData | undefined; components: ComponentRef[];
}
interface BuildItem { objectId: string; path: string | undefined; transform: Affine; printable: boolean }
interface ModelPart {
  unitScale: number; objects: Map<string, ModelObject>; build: BuildItem[]; groups: Map<string, ObjectMaterial[]>;
}

function toColor(value: string | undefined): string | undefined {
  const match = value ? /^#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(value.trim()) : null;
  return match ? `#${match[1]!.toUpperCase()}` : undefined;
}

function parseModelPart(xml: string): ModelPart {
  const part: ModelPart = { unitScale: 1, objects: new Map(), build: [], groups: new Map() };
  let object: ModelObject | undefined;
  let group: ObjectMaterial[] | undefined;
  scanXml(xml, {
    open(name, attributes) {
      switch (name) {
        case 'model': {
          const unit = attributes().unit;
          if (unit !== undefined) {
            const scale = UNIT_TO_MM[unit.toLowerCase()];
            if (scale === undefined) throw new ThreeMfError('threemf-invalid-format');
            part.unitScale = scale;
          }
          break;
        }
        case 'basematerials': case 'colorgroup': {
          const id = attributes().id;
          if (id !== undefined) { group = []; part.groups.set(id, group); }
          break;
        }
        case 'base': {
          const a = attributes(); group?.push({ name: a.name, color: toColor(a.displaycolor) }); break;
        }
        case 'color': {
          group?.push({ color: toColor(attributes().color) }); break;
        }
        case 'object': {
          const a = attributes();
          if (a.id === undefined) throw new ThreeMfError('threemf-invalid-format');
          object = { id: a.id, name: a.name, type: (a.type ?? 'model').toLowerCase(), pid: a.pid, pindex: a.pindex, mesh: undefined, components: [] };
          part.objects.set(a.id, object);
          break;
        }
        case 'mesh': if (object) object.mesh = { vertices: [], triangles: [], materialKeys: new Set() }; break;
        case 'vertex': {
          const mesh = object?.mesh; if (!mesh) break;
          const a = attributes();
          const x = Number(a.x), y = Number(a.y), z = Number(a.z);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new ThreeMfError('threemf-invalid-format');
          mesh.vertices.push(x, y, z); break;
        }
        case 'triangle': {
          const mesh = object?.mesh; if (!mesh) break;
          const a = attributes();
          const v1 = Number(a.v1), v2 = Number(a.v2), v3 = Number(a.v3);
          if (!Number.isInteger(v1) || !Number.isInteger(v2) || !Number.isInteger(v3) || v1 < 0 || v2 < 0 || v3 < 0)
            throw new ThreeMfError('threemf-invalid-format');
          mesh.triangles.push(v1, v2, v3);
          const pid = a.pid ?? object!.pid;
          if (pid !== undefined && a.p1 !== undefined) mesh.materialKeys.add(`${pid}:${a.p1}`);
          break;
        }
        case 'component': {
          const a = attributes(); if (!object || a.objectid === undefined) throw new ThreeMfError('threemf-invalid-format');
          object.components.push({ objectId: a.objectid, path: a.path, transform: parseTransform(a.transform) }); break;
        }
        case 'item': {
          const a = attributes(); if (a.objectid === undefined) throw new ThreeMfError('threemf-invalid-format');
          part.build.push({ objectId: a.objectid, path: a.path, transform: parseTransform(a.transform), printable: a.printable !== '0' }); break;
        }
      }
    },
    close(name) {
      if (name === 'object') object = undefined;
      else if (name === 'basematerials' || name === 'colorgroup') group = undefined;
    },
  });
  return part;
}

interface ObjectConfig { name?: string; extruder?: number }

/** Reads object-level name/extruder metadata written by PrusaSlicer, Bambu Studio and OrcaSlicer. */
function parseConfig(xml: string): Map<string, ObjectConfig> {
  const configs = new Map<string, ObjectConfig>();
  let current: ObjectConfig | undefined;
  let nested = 0;
  scanXml(xml, {
    open(name, attributes) {
      if (name === 'object') {
        const id = attributes().id;
        current = id === undefined ? undefined : {};
        if (current && id !== undefined) configs.set(id, current);
      } else if (name === 'part' || name === 'volume') nested++;
      else if (name === 'metadata' && current && nested === 0) {
        const a = attributes();
        if (a.key === 'name' && a.value) current.name = a.value;
        if (a.key === 'extruder') { const extruder = Number(a.value); if (Number.isInteger(extruder) && extruder > 0) current.extruder = extruder; }
      }
    },
    close(name) {
      if (name === 'object') current = undefined;
      else if ((name === 'part' || name === 'volume') && nested) nested--;
    },
  });
  return configs;
}

interface ZipInfo { names: string[]; encrypted: boolean }

/** Reads the central directory; returns undefined when the bytes are not a zip archive. */
function readZipDirectory(bytes: Uint8Array): ZipInfo | undefined {
  if (bytes.length < 22) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 0xffff); offset--)
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  if (end < 0) return undefined;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const names: string[] = [];
  let encrypted = false;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return undefined;
    if (view.getUint16(offset + 8, true) & 0x1) encrypted = true;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { names, encrypted };
}

function unzipParts(bytes: Uint8Array): Map<string, Uint8Array> {
  let oversized = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(file) {
        const name = file.name.toLowerCase();
        const wanted = name.endsWith('.model') || name === '_rels/.rels' || CONFIG_PARTS.has(name);
        if (wanted && file.originalSize > MAX_PART_BYTES) { oversized = true; return false; }
        return wanted;
      },
    });
  } catch {
    throw new ThreeMfError('threemf-invalid-format');
  }
  if (oversized) throw new ThreeMfError('threemf-too-large');
  return new Map(Object.entries(files).map(([name, data]) => [normalizePath(name), data]));
}

function locateRootModel(parts: Map<string, Uint8Array>, decoder: TextDecoder): string {
  const rels = parts.get('_rels/.rels');
  if (rels) {
    const text = decoder.decode(rels);
    if (/keystore|encryptedfile|\/encrypt/i.test(text)) throw new ThreeMfError('threemf-unsupported');
    let target: string | undefined;
    scanXml(text, {
      open(name, attributes) {
        if (name !== 'Relationship' || target) return;
        const a = attributes();
        if (a.Type?.toLowerCase().endsWith('/3dmodel') && a.Target) target = normalizePath(a.Target);
      },
      close() {},
    });
    if (target && parts.has(target)) return target;
  }
  if (parts.has(DEFAULT_MODEL_PART)) return DEFAULT_MODEL_PART;
  const models = [...parts.keys()].filter(name => name.endsWith('.model'));
  if (models.length === 1) return models[0]!;
  throw new ThreeMfError('threemf-no-model');
}

interface Leaf { mesh: MeshData; matrix: Affine; materials: ObjectMaterial[] }

function buildMesh(leaves: Leaf[], scale: number): MeshBuffers {
  let total = 0;
  for (const leaf of leaves) total += leaf.mesh.triangles.length / 3;
  if (total === 0) throw new ThreeMfError('threemf-no-triangles');

  const positions = new Float32Array(total * 9);
  const normals = new Float32Array(total * 9);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const p = new Array<number>(9).fill(0);
  let written = 0;
  for (const leaf of leaves) {
    const { vertices, triangles } = leaf.mesh;
    const m = leaf.matrix;
    const flip = determinant(m) < 0; // mirrored transforms reverse winding; swap two corners to keep normals outward
    const vertexCount = vertices.length / 3;
    for (let t = 0; t < triangles.length; t += 3) {
      for (let corner = 0; corner < 3; corner++) {
        const index = triangles[t + corner]!;
        if (index >= vertexCount) throw new ThreeMfError('threemf-invalid-format');
        const x = vertices[index * 3]!, y = vertices[index * 3 + 1]!, z = vertices[index * 3 + 2]!;
        p[corner * 3] = (x * m[0]! + y * m[3]! + z * m[6]! + m[9]!) * scale;
        p[corner * 3 + 1] = (x * m[1]! + y * m[4]! + z * m[7]! + m[10]!) * scale;
        p[corner * 3 + 2] = (x * m[2]! + y * m[5]! + z * m[8]! + m[11]!) * scale;
      }
      if (flip) for (let axis = 0; axis < 3; axis++) { const swap = p[3 + axis]!; p[3 + axis] = p[6 + axis]!; p[6 + axis] = swap; }
      const ux = p[3]! - p[0]!, uy = p[4]! - p[1]!, uz = p[5]! - p[2]!;
      const vx = p[6]! - p[0]!, vy = p[7]! - p[1]!, vz = p[8]! - p[2]!;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(length)) throw new ThreeMfError('threemf-invalid-format');
      if (length === 0) continue; // degenerate triangle: no area, nothing to print
      nx /= length; ny /= length; nz /= length;
      const base = written * 9;
      for (let corner = 0; corner < 3; corner++) {
        for (let axis = 0; axis < 3; axis++) {
          const value = p[corner * 3 + axis]!;
          positions[base + corner * 3 + axis] = value;
          if (value < min[axis]!) min[axis] = value;
          if (value > max[axis]!) max[axis] = value;
        }
        normals[base + corner * 3] = nx; normals[base + corner * 3 + 1] = ny; normals[base + corner * 3 + 2] = nz;
      }
      written++;
    }
  }
  if (written === 0) throw new ThreeMfError('threemf-no-triangles');
  return {
    positions: written === total ? positions : positions.slice(0, written * 9),
    normals: written === total ? normals : normals.slice(0, written * 9),
    bounds: { min: min as [number, number, number], max: max as [number, number, number] },
    triangleCount: written,
  };
}

/** Parses 3MF bytes (zip + XML, no DOM) into one plate object per build item. */
export function parse3mfBuffer(buffer: ArrayBuffer, options: Parse3mfOptions = {}): ImportModelResult {
  try {
    const bytes = new Uint8Array(buffer);
    const directory = readZipDirectory(bytes);
    if (!directory) throw new ThreeMfError('threemf-not-zip');
    if (directory.encrypted || directory.names.some(name => /^\/?secure\//i.test(name))) throw new ThreeMfError('threemf-unsupported');

    const parts = unzipParts(bytes);
    const decoder = new TextDecoder();
    const rootPath = locateRootModel(parts, decoder);
    const cache = new Map<string, ModelPart>();
    const loadPart = (path: string): ModelPart => {
      let part = cache.get(path);
      if (!part) {
        const data = parts.get(path);
        if (!data) throw new ThreeMfError('threemf-unsupported'); // production-extension part that is not in the archive
        part = parseModelPart(decoder.decode(data));
        cache.set(path, part);
      }
      return part;
    };
    const root = loadPart(rootPath);
    const configPart = [...CONFIG_PARTS].find(name => parts.has(name));
    const configs = configPart ? parseConfig(decoder.decode(parts.get(configPart)!)) : new Map<string, ObjectConfig>();

    const referenced = new Set<string>();
    for (const object of root.objects.values()) for (const component of object.components) if (!component.path) referenced.add(component.objectId);
    const items: BuildItem[] = root.build.length
      ? root.build.filter(item => item.printable)
      : [...root.objects.values()].filter(object => !referenced.has(object.id))
        .map(object => ({ objectId: object.id, path: undefined, transform: IDENTITY, printable: true }));

    const results: ImportedObject[] = [];
    const limit = options.maxTriangles;
    let usedTriangles = 0;
    for (const item of items) {
      const itemPath = item.path ? normalizePath(item.path) : rootPath;
      const top = loadPart(itemPath).objects.get(item.objectId);
      if (!top) throw new ThreeMfError('threemf-invalid-format');
      if (top.type !== 'model' && top.type !== 'solidsupport') continue;

      const leaves: Leaf[] = [];
      const collect = (partPath: string, objectId: string, matrix: Affine, depth: number, trail: ReadonlySet<string>): void => {
        if (depth > MAX_COMPONENT_DEPTH) throw new ThreeMfError('threemf-invalid-format');
        const part = loadPart(partPath);
        const object = part.objects.get(objectId);
        if (!object) throw new ThreeMfError('threemf-invalid-format');
        const key = `${partPath}#${objectId}`;
        if (trail.has(key)) throw new ThreeMfError('threemf-invalid-format'); // component cycle
        const next = new Set(trail).add(key);
        if (object.mesh && object.mesh.triangles.length) {
          usedTriangles += object.mesh.triangles.length / 3;
          if (limit !== undefined && usedTriangles > limit) throw new ThreeMfError('tier-limit-triangles', { limit });
          const materials: ObjectMaterial[] = [];
          const keys = new Set(object.mesh.materialKeys);
          if (object.pid !== undefined) keys.add(`${object.pid}:${object.pindex ?? '0'}`);
          for (const materialKey of keys) {
            const [pid, index] = materialKey.split(':');
            const material = part.groups.get(pid!)?.[Number(index)];
            if (material && (material.color || material.name)) materials.push(material);
          }
          leaves.push({ mesh: object.mesh, matrix, materials });
        }
        for (const component of object.components)
          collect(component.path ? normalizePath(component.path) : partPath, component.objectId, compose(component.transform, matrix), depth + 1, next);
      };
      collect(itemPath, item.objectId, item.transform, 0, new Set());

      const meshBuffers = buildMesh(leaves, root.unitScale);
      const materials: ObjectMaterial[] = [];
      for (const leaf of leaves) for (const material of leaf.materials)
        if (materials.length < MAX_MATERIALS && !materials.some(known => known.color === material.color && known.name === material.name)) materials.push(material);
      const config = configs.get(item.objectId);
      const imported: ImportedObject = { meshBuffers };
      const name = top.name?.trim() || config?.name?.trim();
      if (name) imported.name = name;
      if (config?.extruder !== undefined) imported.extruder = config.extruder;
      if (materials.length) imported.materials = materials;
      results.push(imported);
    }
    if (!results.length) throw new ThreeMfError('threemf-no-triangles');
    return { ok: true, format: '3mf', objects: results };
  } catch (error) {
    const failure: CodedError = error instanceof ThreeMfError
      ? { code: error.code, ...(error.values ? { values: error.values } : {}) }
      : { code: 'threemf-invalid-format' };
    return { ok: false, error: failure };
  }
}
