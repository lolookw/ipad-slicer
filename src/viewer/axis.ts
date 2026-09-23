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
