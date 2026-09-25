import { Euler, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import {
  encodeEngineTransforms, fromEngineTransform, parseBoundedNumber, POSITION_BOUNDS_MM, ROTATION_BOUNDS_DEG,
  SCALE_BOUNDS_PERCENT, toDegrees, toEngineTransform, toRadians, type ObjectTransform,
} from './transforms';

const app: ObjectTransform = {
  position: [12, -7, 4],
  rotation: [0.3, -0.7, 1.1],
  scale: [2, 0.5, 1.25],
  mirror: [true, false, true],
};

describe('pinned engine transform adapter', () => {
  it('round-trips three.js XYZ orientation through engine ZYX radians', () => {
    const engine = toEngineTransform(app);
    const result = fromEngineTransform(engine, app);
    const before = new Quaternion().setFromEuler(new Euler(...app.rotation, 'XYZ'));
    const after = new Quaternion().setFromEuler(new Euler(...result.rotation, 'XYZ'));

    expect(Math.abs(before.dot(after))).toBeCloseTo(1, 6);
    expect(result.position).toEqual(app.position);
    expect(result.scale).toEqual(app.scale);
    expect(result.mirror).toEqual(app.mirror);
    expect(engine.mirror).toEqual([-1, 1, -1]);
  });

  it('encodes stride 11 and paired NaN auto-placement', () => {
    const explicit = toEngineTransform(app);
    const automatic = toEngineTransform(app, true);
    const table = encodeEngineTransforms([explicit, automatic]);

    expect(table).toHaveLength(22);
    expect([...table.slice(0, 3)]).toEqual(app.scale);
    expect([...table.slice(6, 9)]).toEqual([-1, 1, -1]);
    expect([...table.slice(9, 11)]).toEqual([12, -7]);
    expect(Number.isNaN(table[20])).toBe(true);
    expect(Number.isNaN(table[21])).toBe(true);
  });

  it('preserves the prior viewer position when preparation returns null offset', () => {
    const engine = toEngineTransform(app, true);
    expect(fromEngineTransform(engine, app).position).toEqual(app.position);
  });
});

describe('degrees/radians conversion for the numeric Rotation fields', () => {
  it('round-trips through toDegrees/toRadians', () => {
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 10);
    expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 10);
    expect(toRadians(180)).toBeCloseTo(Math.PI, 10);
    expect(toRadians(toDegrees(1.23456))).toBeCloseTo(1.23456, 10);
  });
});

describe('parseBoundedNumber (typed numeric field validation)', () => {
  it('accepts a finite value inside the bounds', () => {
    expect(parseBoundedNumber(12.5, { min: 0, max: 100 })).toBe(12.5);
    expect(parseBoundedNumber(0, { min: 0, max: 100 })).toBe(0);
    expect(parseBoundedNumber(100, { min: 0, max: 100 })).toBe(100);
  });

  it('rejects NaN and Infinity', () => {
    expect(parseBoundedNumber(NaN, { min: -100, max: 100 })).toBeUndefined();
    expect(parseBoundedNumber(Infinity, { min: -100, max: 100 })).toBeUndefined();
    expect(parseBoundedNumber(-Infinity, { min: -100, max: 100 })).toBeUndefined();
  });

  it('rejects a value outside the bounds', () => {
    expect(parseBoundedNumber(-0.001, { min: 0, max: 100 })).toBeUndefined();
    expect(parseBoundedNumber(100.001, { min: 0, max: 100 })).toBeUndefined();
  });

  it('exposes sane bounds for Position (mm), Rotation (deg) and Scale (%)', () => {
    expect(parseBoundedNumber(50000, POSITION_BOUNDS_MM)).toBe(50000);
    expect(parseBoundedNumber(200000, POSITION_BOUNDS_MM)).toBeUndefined();
    expect(parseBoundedNumber(720, ROTATION_BOUNDS_DEG)).toBe(720);
    expect(parseBoundedNumber(4000, ROTATION_BOUNDS_DEG)).toBeUndefined();
    expect(parseBoundedNumber(100, SCALE_BOUNDS_PERCENT)).toBe(100);
    expect(parseBoundedNumber(0, SCALE_BOUNDS_PERCENT)).toBeUndefined();
    expect(parseBoundedNumber(-5, SCALE_BOUNDS_PERCENT)).toBeUndefined();
  });
});
