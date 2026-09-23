import { Euler, Matrix4, Plane, Quaternion, Ray, Vector3, type PerspectiveCamera } from 'three';
import { axisVector, keepAbovePlate, type AxisName } from './axis';
import { dropToBed, type LocalBounds, type ObjectTransform } from './transforms';

/** Pure pointer-ray math for direct manipulation. Everything is millimeters, Z-up, world space. */

export const MOVE_SNAP_MM = 1;
export const ROTATE_SNAP_RAD = 15 * Math.PI / 180;
const MAX_AXIS_TRAVEL_MM = 5000;
/** Below this |cos| between the ray and the ring plane the intersection is numerically meaningless. */
const MIN_RING_PLANE_COS = 0.04;
/** Below this |cos| between the ray and the horizontal plane's normal the intersection runs away to infinity. */
const MIN_HORIZONTAL_PLANE_COS = 0.04;
/** Below this 1 - cos^2 between the ray and the axis the closest point runs away. */
const MIN_AXIS_SKEW = 1e-3;

export function isSnapping(snapEnabled: boolean, shiftHeld: boolean): boolean { return snapEnabled !== shiftHeld; }
export function snapValue(value: number, step: number): number { return Math.round(value / step) * step; }

/** Ray through the pointer. `ndc` is in [-1, 1] with Y up. */
export function rayFromNdc(camera: PerspectiveCamera, ndcX: number, ndcY: number): Ray {
  camera.updateMatrixWorld();
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const target = new Vector3(ndcX, ndcY, 0.5).unproject(camera);
  return new Ray(origin, target.sub(origin).normalize());
}

/** Point where the ray meets the horizontal plane at `z`, or undefined when parallel/behind/too grazing. */
export function intersectHorizontalPlane(ray: Ray, z: number): Vector3 | undefined {
  if (Math.abs(ray.direction.z) < MIN_HORIZONTAL_PLANE_COS) return undefined;
  return ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -z), new Vector3()) ?? undefined;
}

/** Signed distance along `direction` (unit) of the point on the axis line closest to the pointer ray. */
export function closestParamOnAxis(ray: Ray, origin: Vector3, direction: Vector3): number | undefined {
  const w = new Vector3().subVectors(origin, ray.origin);
  const b = ray.direction.dot(direction);
  const denominator = 1 - b * b;
  if (denominator < MIN_AXIS_SKEW) return undefined;
  const d = ray.direction.dot(w);
  const e = direction.dot(w);
  // Solves the 2x2 normal equations of min |ray(s) - (origin + t * direction)|^2 for t.
  const t = (b * d - e) / denominator;
  return Math.abs(t) > MAX_AXIS_TRAVEL_MM ? undefined : t;
}

/** Point where the ray meets the plane through `center` with normal `axis` (the ring's plane). */
export function intersectRingPlane(ray: Ray, center: Vector3, axis: Vector3): Vector3 | undefined {
  if (Math.abs(ray.direction.dot(axis)) < MIN_RING_PLANE_COS) return undefined;
  return ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(axis, center), new Vector3()) ?? undefined;
}

/** Signed angle in (-PI, PI] from `from` to `to` about `axis`, right-handed. */
export function signedAngleAbout(axis: Vector3, from: Vector3, to: Vector3): number {
  const cross = new Vector3().crossVectors(from, to);
  return Math.atan2(cross.dot(axis), from.dot(to));
}

/**
 * Shortest signed delta from `previous` to `current`, both angles in (-PI, PI], folded into (-PI, PI].
 * Frame-to-frame, `signedAngleAbout` only ever gives an ABSOLUTE angle back to a fixed reference, so it
 * wraps discontinuously once the swept angle passes +-PI. Feeding consecutive raw readings through this
 * and summing the deltas (never the raw readings themselves) turns that into a continuous running total,
 * so a drag that sweeps past 180 degrees, 360 degrees, or several full turns keeps climbing smoothly.
 */
export function unwrapDelta(previous: number, current: number): number {
  return Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
}

/** Vector from the ring center to where the ray meets the ring plane, or undefined while it misses. */
export function ringVector(ray: Ray, center: Vector3, axis: Vector3): Vector3 | undefined {
  const hit = intersectRingPlane(ray, center, axis);
  if (!hit) return undefined;
  const vector = hit.sub(center);
  return vector.lengthSq() < 1e-9 ? undefined : vector;
}

/** Angle swept by the pointer around the ring since `startVector`, or undefined while the ray misses the plane. */
export function ringAngle(ray: Ray, center: Vector3, axis: Vector3, startVector: Vector3): number | undefined {
  const now = ringVector(ray, center, axis);
  return now ? signedAngleAbout(axis, startVector, now) : undefined;
}

export function localCenter(bounds: LocalBounds): Vector3 {
  return new Vector3((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2);
}

function matrixOf(transform: ObjectTransform): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation, 'XYZ')),
    new Vector3(...transform.scale.map((value, index) => (transform.mirror[index] ? -value : value)) as [number, number, number]),
  );
}

/** World-space center of the object's local bounds: the pivot and the gizmo anchor. */
export function objectCenter(bounds: LocalBounds, transform: ObjectTransform): Vector3 {
  return localCenter(bounds).applyMatrix4(matrixOf(transform));
}

/** Orbit pivot rule: the selected object's center when there is a selection, else the plate center. */
export function orbitPivot(selectedCenter: Vector3 | undefined, plateCenter: Vector3): Vector3 {
  return (selectedCenter ?? plateCenter).clone();
}

/**
 * Rotates about a WORLD axis through the object's bounds center. The angle is composed as a
 * quaternion (world-frame delta times the start orientation) and converted back to the stored
 * XYZ Euler, so successive gestures never behave like intrinsic Euler edits.
 */
export function rotateAboutWorldAxis(start: ObjectTransform, bounds: LocalBounds, axis: AxisName, radians: number): ObjectTransform {
  const before = objectCenter(bounds, start);
  const orientation = new Quaternion().setFromAxisAngle(axisVector(axis), radians)
    .multiply(new Quaternion().setFromEuler(new Euler(...start.rotation, 'XYZ')));
  const euler = new Euler().setFromQuaternion(orientation, 'XYZ');
  const next: ObjectTransform = { ...start, rotation: [euler.x, euler.y, euler.z] };
  const shift = before.sub(objectCenter(bounds, next));
  return { ...next, position: [start.position[0] + shift.x, start.position[1] + shift.y, start.position[2] + shift.z] };
}

/** Position Z at which the lowest transformed corner touches the plate. */
export function plateSeatZ(bounds: LocalBounds, transform: ObjectTransform): number {
  return dropToBed(bounds, { ...transform, position: [0, 0, 0] }).position[2];
}

/** True when the lowest transformed corner rests on the plate (within tolerance). */
export function restsOnPlate(bounds: LocalBounds, transform: ObjectTransform): boolean {
  return Math.abs(plateSeatZ(bounds, transform) - transform.position[2]) < 1e-3;
}

/** After a rotation: an object that sat on the plate is re-seated; a lifted one is only kept above it. */
export function settleAfterRotate(next: ObjectTransform, bounds: LocalBounds, wasOnPlate: boolean): ObjectTransform {
  return wasOnPlate
    ? { ...next, position: [next.position[0], next.position[1], plateSeatZ(bounds, next)] }
    : keepAbovePlate(next, bounds);
}

/** World millimeters covered by one CSS pixel at `point`'s depth (perspective camera). */
export function worldPerPixel(camera: PerspectiveCamera, point: Vector3, viewportHeightPx: number): number {
  camera.updateMatrixWorld();
  const forward = new Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
  const depth = Math.max(new Vector3().subVectors(point, new Vector3().setFromMatrixPosition(camera.matrixWorld)).dot(forward), 1e-3);
  return 2 * depth * Math.tan(camera.fov * Math.PI / 360) / Math.max(viewportHeightPx, 1);
}

/** Pointer offsets (CSS px) tried in order for a tolerant pick: center, then an inner and an outer ring. */
export function pickOffsets(radiusPx: number): [number, number][] {
  const offsets: [number, number][] = [[0, 0]];
  for (const scale of [0.5, 1]) for (let i = 0; i < 8; i += 1) {
    if (scale === 0.5 && i % 2) continue;
    const angle = i * Math.PI / 4;
    offsets.push([Math.cos(angle) * radiusPx * scale, Math.sin(angle) * radiusPx * scale]);
  }
  return offsets;
}

export function distanceToSegment2D(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax; const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToPolyline2D(px: number, py: number, points: readonly (readonly [number, number])[], closed = false): number {
  if (points.length === 1) return Math.hypot(px - points[0]![0], py - points[0]![1]);
  let best = Infinity;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i]!; const b = points[(i + 1) % points.length]!;
    best = Math.min(best, distanceToSegment2D(px, py, a[0], a[1], b[0], b[1]));
  }
  return best;
}

/** World offset that pans the view so the scene follows a finger/trackpad moving `dxPx, dyPx`. */
export function screenPanDelta(camera: PerspectiveCamera, target: Vector3, dxPx: number, dyPx: number, viewportHeightPx: number): Vector3 {
  camera.updateMatrixWorld();
  const scale = worldPerPixel(camera, target, viewportHeightPx);
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  return right.multiplyScalar(-dxPx * scale).add(up.multiplyScalar(dyPx * scale));
}

/** Tight clip planes around a bounding sphere so a shallow depth range avoids z-fighting on the bed. */
export function tightClipPlanes(distanceToCenter: number, radius: number): { near: number; far: number } {
  const near = Math.max(1, distanceToCenter - radius * 1.05);
  return { near, far: Math.max(near * 2, distanceToCenter + radius * 1.05) };
}

/** Classifies a wheel event: pinch (ctrl) and notched mouse wheels zoom; smooth two-finger scrolls pan. */
export function classifyWheel(event: { ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number }): 'zoom' | 'pan' {
  if (event.ctrlKey || event.deltaMode !== 0) return 'zoom';
  return event.deltaX !== 0 || Math.abs(event.deltaY) < 40 ? 'pan' : 'zoom';
}
