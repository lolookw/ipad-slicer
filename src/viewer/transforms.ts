import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from 'three';

/**
 * Pinned by scripts/engine-contract-check.mjs against wasm-v2.4.2-patch19:
 * engine stride 11 is scale3, rotation3, mirror3, offsetXY2; rotation is radians in
 * intrinsic ZYX Euler order; finite XY offsets are deltas from centered plate placement;
 * NaN/NaN auto-places both axes (mixed finite/NaN is invalid). preparePlate returns
 * {scale,rotation,mirror,offset}, with null offset for auto-placement and +/-1 mirrors.
 * App transforms remain millimeters, Z-up, and three.js intrinsic XYZ Euler order.
 */
export interface ObjectTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mirror: [boolean, boolean, boolean];
}

export const IDENTITY_TRANSFORM: ObjectTransform = {
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false],
};

export interface EngineTransform {
  scale: [number, number, number];
  rotation: [number, number, number];
  mirror: [1 | -1, 1 | -1, 1 | -1];
  offset: [number, number] | null;
}

export function toEngineTransform(transform: ObjectTransform, autoPlace = false): EngineTransform {
  const rotation = new Euler().setFromQuaternion(new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ')), 'ZYX');
  return {
    scale: [...transform.scale],
    rotation: [rotation.x, rotation.y, rotation.z],
    mirror: transform.mirror.map(value => value ? -1 : 1) as EngineTransform['mirror'],
    offset: autoPlace ? null : [transform.position[0], transform.position[1]],
  };
}

export function fromEngineTransform(engine: EngineTransform, previous: ObjectTransform = IDENTITY_TRANSFORM): ObjectTransform {
  const rotation = new Euler().setFromQuaternion(new Quaternion().setFromEuler(new Euler(...engine.rotation, 'ZYX')), 'XYZ');
  return {
    position: engine.offset ? [engine.offset[0], engine.offset[1], previous.position[2]] : [...previous.position],
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: [...engine.scale],
    mirror: engine.mirror.map(value => value < 0) as ObjectTransform['mirror'],
  };
}

export function encodeEngineTransforms(transforms: readonly EngineTransform[]): Float32Array {
  const table = new Float32Array(transforms.length * 11);
  transforms.forEach((transform, index) => {
    const offset = index * 11;
    table.set(transform.scale, offset);
    table.set(transform.rotation, offset + 3);
    table.set(transform.mirror, offset + 6);
    table[offset + 9] = transform.offset?.[0] ?? NaN;
    table[offset + 10] = transform.offset?.[1] ?? NaN;
  });
  return table;
}

/** Applies an ObjectTransform to a three.js Object3D. Mirroring is a per-axis scale sign flip. */
export function applyTransform(object: Object3D, transform: ObjectTransform): void {
  object.position.set(...transform.position);
  object.rotation.set(...transform.rotation);
  const [sx, sy, sz] = transform.scale;
  const [mx, my, mz] = transform.mirror;
  object.scale.set(mx ? -sx : sx, my ? -sy : sy, mz ? -sz : sz);
}

/** Reads the current transform back off an Object3D, decomposing any accumulated mirror sign. */
export function readTransform(object: Object3D, previousMirror: ObjectTransform['mirror']): ObjectTransform {
  const scale = object.scale;
  return {
    position: object.position.toArray(),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)],
    mirror: [scale.x < 0 !== previousMirror[0], scale.y < 0 !== previousMirror[1], scale.z < 0 !== previousMirror[2]].map(
      (flipped, index) => (flipped ? !previousMirror[index] : previousMirror[index]),
    ) as ObjectTransform['mirror'],
  };
}

/** Rotates 90 degrees about a world axis, composing with the existing rotation. */
export function rotate90(transform: ObjectTransform, axis: 'x' | 'y'): ObjectTransform {
  const quarterTurn = new Quaternion().setFromAxisAngle(axis === 'x' ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0), Math.PI / 2);
  const current = new Quaternion().setFromEuler(new Euler(...transform.rotation));
  const next = new Euler().setFromQuaternion(quarterTurn.multiply(current));
  return { ...transform, rotation: [next.x, next.y, next.z] };
}

/** Local, untransformed bounds of an imported mesh (millimeters), before any plate transform. */
export interface LocalBounds { min: [number, number, number]; max: [number, number, number] }

/** World-space AABB size of an object with its transform applied, without mutating the scene. */
export function transformedSize(bounds: LocalBounds, transform: ObjectTransform): [number, number, number] {
  const matrix = new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation)),
    new Vector3(...transform.scale.map((value, index) => (transform.mirror[index] ? -value : value)) as [number, number, number]),
  );
  const corners: Vector3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]])
    corners.push(new Vector3(x, y, z).applyMatrix4(matrix));
  const min = corners.reduce((a, b) => a.min(b), corners[0]!.clone());
  const max = corners.reduce((a, b) => a.max(b), corners[0]!.clone());
  return [max.x - min.x, max.y - min.y, max.z - min.z];
}

/** Drops an object so its transformed bounds rest on the bed (world Z = 0). */
export function dropToBed(bounds: LocalBounds, transform: ObjectTransform): ObjectTransform {
  const matrix = new Matrix4().compose(
    new Vector3(0, 0, 0),
    new Quaternion().setFromEuler(new Euler(...transform.rotation)),
    new Vector3(...transform.scale.map((value, index) => (transform.mirror[index] ? -value : value)) as [number, number, number]),
  );
  let minZ = Infinity;
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]])
    minZ = Math.min(minZ, new Vector3(x, y, z).applyMatrix4(matrix).z);
  return { ...transform, position: [transform.position[0], transform.position[1], transform.position[2] - minZ] };
}

const UNITS_TO_MM: Record<'mm' | 'in' | 'cm', number> = { mm: 1, in: 25.4, cm: 10 };
export type DisplayUnit = keyof typeof UNITS_TO_MM;

/** Converts a physical length to millimeters. Percent is handled by the caller (it is relative, not absolute). */
export function toMillimeters(value: number, unit: DisplayUnit): number {
  return value * UNITS_TO_MM[unit];
}
export function fromMillimeters(valueMm: number, unit: DisplayUnit): number {
  return valueMm / UNITS_TO_MM[unit];
}

/** Degrees for display <-> the radians ObjectTransform.rotation stores (three.js intrinsic XYZ Euler). */
export function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}
export function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

/** Inclusive numeric range a typed field value must fall in to be accepted. */
export interface NumericFieldBounds { min: number; max: number }

/** Parses a typed field value: rejects NaN/Infinity and anything outside `bounds`, returns undefined instead of throwing. */
export function parseBoundedNumber(value: number, bounds: NumericFieldBounds): number | undefined {
  return Number.isFinite(value) && value >= bounds.min && value <= bounds.max ? value : undefined;
}

/** Sane typed-field bounds for the Position/Rotation/Scale numeric panel (TransformFields.tsx). */
export const POSITION_BOUNDS_MM: NumericFieldBounds = { min: -100000, max: 100000 };
export const ROTATION_BOUNDS_DEG: NumericFieldBounds = { min: -3600, max: 3600 };
export const SCALE_BOUNDS_PERCENT: NumericFieldBounds = { min: 0.1, max: 100000 };
