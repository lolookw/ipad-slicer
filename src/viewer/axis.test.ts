import { describe, expect, it } from 'vitest';
import {
  AXIS_COLORS, axisVector, formatMoveReadout, formatRotateReadout, keepAbovePlate,
  withPositionAxis, withRotationAxis, withScaleAxis, withUniformScale,
} from './axis';
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

describe('absolute-set helpers for the numeric Position/Rotation/Scale panel', () => {
  const transform: ObjectTransform = { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3], scale: [1, 2, 3], mirror: [false, true, false] };

  it('withPositionAxis replaces exactly one position component in millimeters', () => {
    expect(withPositionAxis(transform, 'x', 42).position).toEqual([42, 2, 3]);
    expect(withPositionAxis(transform, 'y', -7).position).toEqual([1, -7, 3]);
    expect(withPositionAxis(transform, 'z', 9).position).toEqual([1, 2, 9]);
    // Nothing else is touched.
    expect(withPositionAxis(transform, 'x', 42).rotation).toEqual(transform.rotation);
    expect(withPositionAxis(transform, 'x', 42).scale).toEqual(transform.scale);
    expect(withPositionAxis(transform, 'x', 42).mirror).toEqual(transform.mirror);
  });

  it('withRotationAxis replaces exactly one Euler component and never composes with the previous value', () => {
    const first = withRotationAxis(transform, 'x', Math.PI / 6);
    expect(first.rotation).toEqual([Math.PI / 6, 0.2, 0.3]);
    // A second absolute set overwrites, it does not add to, the first.
    const second = withRotationAxis(first, 'x', Math.PI / 4);
    expect(second.rotation).toEqual([Math.PI / 4, 0.2, 0.3]);
  });

  it('withScaleAxis sets exactly one axis factor, independent of the others', () => {
    expect(withScaleAxis(transform, 'y', 5).scale).toEqual([1, 5, 3]);
  });

  it('withUniformScale sets all three scale axes to the same factor', () => {
    expect(withUniformScale(transform, 2.5).scale).toEqual([2.5, 2.5, 2.5]);
  });
});
