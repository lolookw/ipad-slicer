import { Euler, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { encodeEngineTransforms, fromEngineTransform, toEngineTransform, type ObjectTransform } from './transforms';

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
