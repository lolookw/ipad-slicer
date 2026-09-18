import { describe, expect, it } from 'vitest';
import { formatMoveReadout, formatRotateReadout, moveAlongAxis, rotateAroundAxis, verticalDragDistance } from './axis';
import { IDENTITY_TRANSFORM, type ObjectTransform } from './transforms';

const bounds = { min: [-5, -5, -5], max: [5, 5, 5] } as const;
const localBounds = { min: [...bounds.min], max: [...bounds.max] } as { min: [number, number, number]; max: [number, number, number] };
const start: ObjectTransform = { ...IDENTITY_TRANSFORM, position: [10, 20, 5], rotation: [0, 0, 0] };

describe('axis-locked transforms', () => {
  it.each(['x', 'y', 'z'] as const)('moves only %s without mutating the starting transform', axis => {
    const index = { x: 0, y: 1, z: 2 }[axis];
    const next = moveAlongAxis(start, [3, 4, 6], axis, localBounds);
    next.position.forEach((value, i) => expect(value).toBe(start.position[i]! + (i === index ? [3, 4, 6][i]! : 0)));
    expect(start.position).toEqual([10, 20, 5]);
  });
  it('preserves free XY movement and ignores vertical delta', () => {
    expect(moveAlongAxis(start, [3, 4, 6], 'free', localBounds).position).toEqual([13, 24, 5]);
  });
  it('clamps Z to the transformed lower bound and allows lifting', () => {
    const tilted: ObjectTransform = { ...start, rotation: [Math.PI / 4, 0, 0], scale: [1, 2, 1] };
    expect(moveAlongAxis(tilted, [0, 0, -100], 'z', localBounds).position[2]).toBeCloseTo(15 / Math.sqrt(2));
    expect(moveAlongAxis(start, [0, 0, 12], 'z', localBounds).position[2]).toBe(17);
  });
  it.each(['x', 'y', 'z', 'free'] as const)('rotates only the selected Euler component for %s', axis => {
    const initial: ObjectTransform = { ...start, rotation: [0.1, 0.2, 0.3] };
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const next = rotateAroundAxis(initial, 0.7, axis);
    next.rotation.forEach((value, i) => expect(value).toBeCloseTo(initial.rotation[i]! + (i === index ? 0.7 : 0)));
    expect(initial.rotation).toEqual([0.1, 0.2, 0.3]);
  });
  it('maps upward screen movement to positive lift in camera-scaled millimeters', () => {
    expect(verticalDragDistance(0.2, 100, 90)).toBeCloseTo(20);
    expect(verticalDragDistance(-0.2, 100, 90)).toBeCloseTo(-20);
  });
  it('formats signed millimeter and degree readouts', () => {
    expect(formatMoveReadout('x', 12.54)).toBe('X +12.5 mm');
    expect(formatMoveReadout('y', -3)).toBe('Y -3.0 mm');
    expect(formatRotateReadout('z', Math.PI / 6)).toBe('Z 30.0°');
  });
});
