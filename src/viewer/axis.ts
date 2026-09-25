import { Vector3 } from 'three';
import { dropToBed, type LocalBounds, type ObjectTransform } from './transforms';

export type AxisName = 'x' | 'y' | 'z';
export const AXIS_NAMES: readonly AxisName[] = ['x', 'y', 'z'];
export const AXIS_COLORS = { x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 } as const;
export const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

export function axisVector(axis: AxisName): Vector3 {
  return new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
}

/** Minimum translation that keeps every transformed bounds corner above the Z-up plate. */
export function keepAbovePlate(transform: ObjectTransform, bounds: LocalBounds): ObjectTransform {
  const floor = dropToBed(bounds, { ...transform, position: [0, 0, 0] }).position[2];
  return { ...transform, position: [transform.position[0], transform.position[1], Math.max(floor, transform.position[2])] };
}

export function formatMoveReadout(axis: AxisName, changeMm: number): string {
  return `${axis.toUpperCase()} ${changeMm >= 0 ? '+' : ''}${changeMm.toFixed(1)} mm`;
}

export function formatRotateReadout(axis: AxisName, radians: number): string {
  return `${axis.toUpperCase()} ${(radians * 180 / Math.PI).toFixed(1)}°`;
}

/**
 * Absolute-set helpers for the numeric Position/Rotation/Scale panel (TransformFields.tsx): each
 * replaces exactly one axis component of an ObjectTransform, leaving the array's own semantics
 * (world millimeters for position, the app's stored intrinsic XYZ Euler radians for rotation, a raw
 * multiplier for scale) and every other component untouched. These are deliberately NOT built on
 * drag-math.ts's `rotateAboutWorldAxis`: that function composes a world-frame DELTA quaternion onto
 * whatever rotation the object already has (right for an incremental drag), whereas typing "30" into
 * a Rotation X field means "this Euler component IS 30 degrees now" — an absolute set, not a delta —
 * so composing would double-apply or silently reinterpret the stored value instead of writing it.
 */
export function withPositionAxis(transform: ObjectTransform, axis: AxisName, valueMm: number): ObjectTransform {
  const position = [...transform.position] as ObjectTransform['position'];
  position[AXIS_INDEX[axis]] = valueMm;
  return { ...transform, position };
}

export function withRotationAxis(transform: ObjectTransform, axis: AxisName, radians: number): ObjectTransform {
  const rotation = [...transform.rotation] as ObjectTransform['rotation'];
  rotation[AXIS_INDEX[axis]] = radians;
  return { ...transform, rotation };
}

export function withScaleAxis(transform: ObjectTransform, axis: AxisName, factor: number): ObjectTransform {
  const scale = [...transform.scale] as ObjectTransform['scale'];
  scale[AXIS_INDEX[axis]] = factor;
  return { ...transform, scale };
}

/** Sets all three scale axes to the same factor — the link-locked (proportional) scale commit. */
export function withUniformScale(transform: ObjectTransform, factor: number): ObjectTransform {
  return { ...transform, scale: [factor, factor, factor] };
}
