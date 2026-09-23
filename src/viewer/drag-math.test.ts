import { Euler, PerspectiveCamera, Quaternion, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { axisVector } from './axis';
import {
  classifyWheel, closestParamOnAxis, distanceToPolyline2D, distanceToSegment2D, intersectHorizontalPlane, isSnapping, objectCenter,
  orbitPivot, pickOffsets, rayFromNdc, restsOnPlate, ringAngle, rotateAboutWorldAxis, screenPanDelta, settleAfterRotate, signedAngleAbout,
  snapValue, tightClipPlanes, unwrapDelta, worldPerPixel, ROTATE_SNAP_RAD,
} from './drag-math';
import { IDENTITY_TRANSFORM, type LocalBounds, type ObjectTransform } from './transforms';

const bounds: LocalBounds = { min: [0, 0, 0], max: [20, 10, 4] };

function camera(position: [number, number, number], target: [number, number, number] = [0, 0, 0]): PerspectiveCamera {
  const value = new PerspectiveCamera(45, 1, 0.1, 5000);
  value.up.set(0, 0, 1);
  value.position.set(...position);
  value.lookAt(...target);
  value.updateMatrixWorld();
  return value;
}

const quaternionOf = (rotation: readonly number[]) => new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2], 'XYZ'));
const sameOrientation = (a: readonly number[], b: readonly number[]) => Math.abs(quaternionOf(a).dot(quaternionOf(b)));

describe('snapping', () => {
  it('rounds to the step and inverts with Shift', () => {
    expect(snapValue(7.4, 1)).toBe(7);
    expect(snapValue(0.27, ROTATE_SNAP_RAD) / ROTATE_SNAP_RAD).toBe(1);
    expect(isSnapping(true, false)).toBe(true);
    expect(isSnapping(true, true)).toBe(false);
    expect(isSnapping(false, true)).toBe(true);
    expect(isSnapping(false, false)).toBe(false);
  });
});

describe('ray helpers', () => {
  it('intersects the horizontal plane through a grab depth, not the bed', () => {
    const view = camera([0, -100, 100]);
    const ray = rayFromNdc(view, 0, 0);
    const bed = intersectHorizontalPlane(ray, 0)!;
    const lifted = intersectHorizontalPlane(ray, 30)!;
    expect(bed.z).toBeCloseTo(0);
    expect(lifted.z).toBeCloseTo(30);
    expect(lifted.y).not.toBeCloseTo(bed.y);
    expect(intersectHorizontalPlane(new Ray(new Vector3(0, 0, 10), new Vector3(1, 0, 0)), 0)).toBeUndefined();
  });

  it('refuses a near-horizontal ray instead of returning a point thousands of mm away', () => {
    // A camera close to eye level with the plate: the ray to its center is nearly parallel to it.
    const view = camera([0, -300, 2]);
    const ray = rayFromNdc(view, 0, 0);
    expect(Math.abs(ray.direction.z)).toBeLessThan(0.04); // sanity: this genuinely grazes the plane
    expect(intersectHorizontalPlane(ray, 0)).toBeUndefined();
  });

  it('finds the axis parameter closest to the pointer ray, relative positions being exact', () => {
    const view = camera([0, -200, 150]);
    const origin = new Vector3(5, 5, 5);
    for (const axis of ['x', 'y', 'z'] as const) {
      const direction = axisVector(axis);
      const world = origin.clone().addScaledVector(direction, 37);
      const ndc = world.clone().project(view);
      const t = closestParamOnAxis(rayFromNdc(view, ndc.x, ndc.y), origin, direction)!;
      expect(t).toBeCloseTo(37, 3);
    }
  });

  it('refuses an axis that points straight along the ray', () => {
    const view = camera([0, 0, 200]);
    expect(closestParamOnAxis(rayFromNdc(view, 0, 0), new Vector3(0, 0, 0), new Vector3(0, 0, 1))).toBeUndefined();
  });
});

describe('ring angle', () => {
  const center = new Vector3(0, 0, 0);
  const z = axisVector('z');
  it('measures signed right-handed angle from the start vector', () => {
    expect(signedAngleAbout(z, new Vector3(1, 0, 0), new Vector3(0, 1, 0))).toBeCloseTo(Math.PI / 2);
    expect(signedAngleAbout(z, new Vector3(1, 0, 0), new Vector3(0, -1, 0))).toBeCloseTo(-Math.PI / 2);
    expect(signedAngleAbout(z, new Vector3(1, 0, 0), new Vector3(-1, 0.001, 0))).toBeCloseTo(Math.PI, 2);
  });
  it('reads the angle from the ray/ring-plane intersection around the center', () => {
    const view = camera([0, -150, 120]);
    const at = (angle: number) => {
      const ndc = new Vector3(Math.cos(angle) * 40, Math.sin(angle) * 40, 0).project(view);
      return rayFromNdc(view, ndc.x, ndc.y);
    };
    const start = new Vector3(40, 0, 0);
    expect(ringAngle(at(0), center, z, start)).toBeCloseTo(0);
    expect(ringAngle(at(Math.PI / 3), center, z, start)).toBeCloseTo(Math.PI / 3);
    expect(ringAngle(at(-Math.PI / 4), center, z, start)).toBeCloseTo(-Math.PI / 4);
  });
  it('ignores a ring seen exactly edge-on', () => {
    const edgeOn = camera([0, -200, 0]);
    expect(ringAngle(rayFromNdc(edgeOn, 0.3, 0), center, z, new Vector3(1, 0, 0))).toBeUndefined();
  });
});

describe('unwrapDelta', () => {
  it('returns the plain difference when it does not cross the +-PI seam', () => {
    expect(unwrapDelta(0, Math.PI / 4)).toBeCloseTo(Math.PI / 4);
    expect(unwrapDelta(Math.PI / 4, 0)).toBeCloseTo(-Math.PI / 4);
    expect(unwrapDelta(-1, 1)).toBeCloseTo(2);
  });

  it('takes the short way across the wrap instead of the raw (wrong) long way', () => {
    // Reading in radians: previous is just under +PI, current is just under -PI (wrapped). The pointer
    // actually moved forward by a small amount, not backward by nearly a full turn.
    const justUnderPi = Math.PI - 0.01;
    const justUnderMinusPi = -Math.PI + 0.01;
    expect(unwrapDelta(justUnderPi, justUnderMinusPi)).toBeCloseTo(0.02);
    expect(unwrapDelta(justUnderMinusPi, justUnderPi)).toBeCloseTo(-0.02);
  });

  it('accumulates through repeated wraps to reconstruct a continuous multi-turn sweep', () => {
    // Simulates signedAngleAbout's wrapped (-PI, PI] readings for a steady one-direction sweep from
    // 0 to 720 degrees in 24 steps (30deg each): the readings themselves saw-tooth, but folding each
    // step's unwrapDelta into a running total reconstructs the true continuous angle.
    let accumulated = 0;
    let lastRaw = 0;
    let trueDegrees = 0;
    for (let step = 1; step <= 24; step += 1) {
      trueDegrees += 30;
      const raw = Math.atan2(Math.sin(trueDegrees * Math.PI / 180), Math.cos(trueDegrees * Math.PI / 180));
      accumulated += unwrapDelta(lastRaw, raw);
      lastRaw = raw;
    }
    expect(accumulated).toBeCloseTo(720 * Math.PI / 180, 6);
  });
});

describe('world-axis rotation', () => {
  const start: ObjectTransform = { ...IDENTITY_TRANSFORM, position: [3, -2, 0], rotation: [0.3, -0.7, 1.1] };

  it('composes about the WORLD axis and round-trips through XYZ Euler', () => {
    for (const axis of ['x', 'y', 'z'] as const) for (const angle of [0.2, -1.3, Math.PI / 2, 2.9]) {
      const next = rotateAboutWorldAxis(start, bounds, axis, angle);
      const expected = new Quaternion().setFromAxisAngle(axisVector(axis), angle).multiply(quaternionOf(start.rotation));
      expect(Math.abs(quaternionOf(next.rotation).dot(expected))).toBeCloseTo(1, 6);
    }
  });

  it('is not the intrinsic Euler edit: a tilted object turned about world Z keeps its tilt axis fixed in the world', () => {
    const tilted: ObjectTransform = { ...IDENTITY_TRANSFORM, rotation: [Math.PI / 2, 0, 0] };
    const next = rotateAboutWorldAxis(tilted, bounds, 'z', Math.PI / 2);
    const worldUp = new Vector3(0, 0, 1).applyQuaternion(quaternionOf(next.rotation));
    const before = new Vector3(0, 0, 1).applyQuaternion(quaternionOf(tilted.rotation));
    // Turning about world Z leaves a vector already along world Z... and rotates horizontal ones.
    expect(worldUp.z).toBeCloseTo(before.z);
    const naive = sameOrientation([Math.PI / 2, 0, Math.PI / 2], next.rotation);
    expect(naive).toBeLessThan(0.999);
  });

  it('keeps the bounds center fixed while rotating', () => {
    const next = rotateAboutWorldAxis(start, bounds, 'y', 0.9);
    expect(objectCenter(bounds, next).distanceTo(objectCenter(bounds, start))).toBeCloseTo(0, 6);
  });

  it('a pure Z turn from identity only changes the Z Euler component', () => {
    const next = rotateAboutWorldAxis(IDENTITY_TRANSFORM, bounds, 'z', Math.PI / 12);
    expect(next.rotation[0]).toBeCloseTo(0);
    expect(next.rotation[1]).toBeCloseTo(0);
    expect(next.rotation[2]).toBeCloseTo(Math.PI / 12);
  });

  it('re-seats a plate-resting object and only lifts a floating one', () => {
    const flat: ObjectTransform = { ...IDENTITY_TRANSFORM };
    expect(restsOnPlate(bounds, flat)).toBe(true);
    const turned = settleAfterRotate(rotateAboutWorldAxis(flat, bounds, 'x', Math.PI / 4), bounds, true);
    expect(restsOnPlate(bounds, turned)).toBe(true);
    const floating: ObjectTransform = { ...IDENTITY_TRANSFORM, position: [0, 0, 50] };
    expect(restsOnPlate(bounds, floating)).toBe(false);
    expect(settleAfterRotate(floating, bounds, false).position[2]).toBe(50);
    const sunk = settleAfterRotate({ ...IDENTITY_TRANSFORM, position: [0, 0, -9] }, bounds, false);
    expect(sunk.position[2]).toBeCloseTo(0);
  });
});

describe('pivot rule', () => {
  it('uses the selected center when present, else the plate center', () => {
    const plate = new Vector3(0, 0, 0);
    const selected = objectCenter(bounds, { ...IDENTITY_TRANSFORM, position: [50, 0, 0] });
    expect(orbitPivot(selected, plate).toArray()).toEqual([60, 5, 2]);
    expect(orbitPivot(undefined, plate).toArray()).toEqual([0, 0, 0]);
    expect(orbitPivot(undefined, plate)).not.toBe(plate);
  });
});

describe('screen-constant sizing', () => {
  it('measures world millimeters per pixel and scales with distance', () => {
    const near = worldPerPixel(camera([0, -100, 0]), new Vector3(0, 0, 0), 800);
    const far = worldPerPixel(camera([0, -200, 0]), new Vector3(0, 0, 0), 800);
    expect(near).toBeCloseTo(2 * 100 * Math.tan(22.5 * Math.PI / 180) / 800);
    expect(far / near).toBeCloseTo(2);
  });
  it('pans in camera space so the scene follows the finger', () => {
    const view = camera([0, -100, 0]);
    const delta = screenPanDelta(view, new Vector3(), 10, 0, 800);
    expect(delta.x).toBeLessThan(0);
    expect(Math.abs(delta.y) + Math.abs(delta.z)).toBeCloseTo(0);
  });
});

describe('touch pick tolerance and 2D hit distances', () => {
  it('tries the exact point first, then an inner and outer ring within the radius', () => {
    const offsets = pickOffsets(12);
    expect(offsets[0]).toEqual([0, 0]);
    expect(offsets).toHaveLength(13);
    expect(Math.max(...offsets.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(12);
  });
  it('measures distance to segments and polylines', () => {
    expect(distanceToSegment2D(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distanceToSegment2D(-3, 4, 0, 0, 10, 0)).toBe(5);
    expect(distanceToPolyline2D(5, 3, [[0, 0], [10, 0], [10, 10]])).toBe(3);
    expect(distanceToPolyline2D(5, 5, [[0, 0], [10, 0], [10, 10]], true)).toBe(0);
    expect(distanceToPolyline2D(3, 4, [[0, 0]])).toBe(5);
  });
});

describe('clip planes and wheel', () => {
  it('wraps the bed sphere tightly', () => {
    const planes = tightClipPlanes(500, 200);
    expect(planes.near).toBeCloseTo(500 - 210);
    expect(planes.far).toBeCloseTo(710);
    expect(planes.far / planes.near).toBeLessThan(3);
    expect(tightClipPlanes(50, 200).near).toBe(1);
  });
  it('classifies pinch and notched wheels as zoom and smooth scrolls as pan', () => {
    expect(classifyWheel({ ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: 3 })).toBe('zoom');
    expect(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100 })).toBe('zoom');
    expect(classifyWheel({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe('zoom');
    expect(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaX: 4, deltaY: 12 })).toBe('pan');
    expect(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 7 })).toBe('pan');
  });
});
