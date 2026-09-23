import { describe, expect, it } from 'vitest';
import { AXIS_COLORS, axisVector, formatMoveReadout, formatRotateReadout, keepAbovePlate } from './axis';
import { IDENTITY_TRANSFORM, type ObjectTransform } from './transforms';

const bounds = { min: [-5, -5, -5], max: [5, 5, 5] } as { min: [number, number, number]; max: [number, number, number] };

describe('axis helpers', () => {
  it('uses the red/green/blue slicer axis palette', () => {
    expect(AXIS_COLORS).toEqual({ x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 });
    expect(axisVector('y').toArray()).toEqual([0, 1, 0]);
  });
  it('clamps to the transformed lower bound and never pushes an object down', () => {
    const tilted: ObjectTransform = { ...IDENTITY_TRANSFORM, position: [0, 0, -100], rotation: [Math.PI / 4, 0, 0], scale: [1, 2, 1] };
    expect(keepAbovePlate(tilted, bounds).position[2]).toBeCloseTo(15 / Math.sqrt(2));
    expect(keepAbovePlate({ ...IDENTITY_TRANSFORM, position: [0, 0, 17] }, bounds).position[2]).toBe(17);
  });
  it('formats signed millimeter and degree readouts', () => {
    expect(formatMoveReadout('x', 12.54)).toBe('X +12.5 mm');
    expect(formatMoveReadout('y', -3)).toBe('Y -3.0 mm');
    expect(formatRotateReadout('z', Math.PI / 6)).toBe('Z 30.0°');
  });
});
