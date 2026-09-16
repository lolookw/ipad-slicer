import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from 'three';

/**
 * App-internal object transform. Millimeters, Z-up, XYZ Euler order — three.js's own
 * conventions. This is deliberately NOT the engine's stride-11 encoding: that mapping
 * (rotation units, Euler order, offset origin) is unverified until the PR 4b Node contract
 * check (task 7.1) pins it against the real engine. Nothing here may be assumed to match it.
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
