import { dropToBed, type LocalBounds, type ObjectTransform } from './transforms';

export type AxisLock = 'free' | 'x' | 'y' | 'z';
export const AXIS_COLORS = { x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 } as const;
export const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/** Minimum translation that keeps every transformed bounds corner above the Z-up plate. */
export function keepAbovePlate(transform: ObjectTransform, bounds: LocalBounds): ObjectTransform {
  const floor = dropToBed(bounds, { ...transform, position: [0, 0, 0] }).position[2];
  return { ...transform, position: [transform.position[0], transform.position[1], Math.max(floor, transform.position[2])] };
}

/** Absolute-from-start translation; locked axes never change the other two components. */
export function moveAlongAxis(start: ObjectTransform, delta: [number, number, number], axis: AxisLock, bounds: LocalBounds): ObjectTransform {
  const position = start.position.map((value, index) => value +
    ((axis === 'free' ? index < 2 : index === AXIS_INDEX[axis]) ? delta[index]! : 0)) as ObjectTransform['position'];
  const next = { ...start, position };
  return axis === 'z' ? keepAbovePlate(next, bounds) : next;
}

/** App transforms use intrinsic XYZ Euler components; Free retains the original Z rotation. */
export function rotateAroundAxis(start: ObjectTransform, radians: number, axis: AxisLock): ObjectTransform {
  const rotation: ObjectTransform['rotation'] = [...start.rotation];
  rotation[axis === 'free' ? 2 : AXIS_INDEX[axis]] += radians;
  return { ...start, rotation };
}

/** NDC Y grows upward, so upward dragging lifts even when Z projects to a point (top view). */
export function verticalDragDistance(ndcDeltaY: number, distanceMm: number, verticalFovDegrees: number): number {
  return ndcDeltaY * distanceMm * Math.tan(verticalFovDegrees * Math.PI / 360);
}

export function formatMoveReadout(axis: Exclude<AxisLock, 'free'>, changeMm: number): string {
  return `${axis.toUpperCase()} ${changeMm >= 0 ? '+' : ''}${changeMm.toFixed(1)} mm`;
}

export function formatRotateReadout(axis: Exclude<AxisLock, 'free'>, radians: number): string {
  return `${axis.toUpperCase()} ${(radians * 180 / Math.PI).toFixed(1)}°`;
}
