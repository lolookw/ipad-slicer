import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { plate } from '../app/stores/plate';
import { rayFromNdc } from './drag-math';
import { createGizmo } from './gizmo';
import { IDENTITY_TRANSFORM, type ObjectTransform } from './transforms';

function isoCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(120, -160, 140);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

const camera = isoCamera();
/** Ray from the camera through a world point, as a pointer over that point would produce. */
function rayTo(point: [number, number, number]) {
  const ndc = new Vector3(...point).project(camera);
  return rayFromNdc(camera, ndc.x, ndc.y);
}

function seedObject(id: string, transform: ObjectTransform = IDENTITY_TRANSFORM) {
  plate.addObject({ id, name: id, transform, triangleCount: 12, bounds: { min: [-5, -5, 0], max: [5, 5, 10] } });
  return plate.state.objects.find(object => object.id === id)!;
}
const current = (id = 'a') => plate.state.objects.find(object => object.id === id)!.transform;

beforeEach(() => { plate.clear(); });

describe('createGizmo sessions', () => {
  it('tracks the locked object only between begin() and end()', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    expect(gizmo.active).toBe(false);
    gizmo.begin(object, { kind: 'ring', axis: 'z' }, rayTo([10, 0, 5]));
    expect(gizmo.active).toBe(true);
    expect(gizmo.lockedObjectId).toBe('a');
    gizmo.end();
    expect(gizmo.active).toBe(false);
    expect(gizmo.lockedObjectId).toBeUndefined();
  });

  it('moves a body drag on the horizontal plane through the grab depth and keeps Z', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    const grab = new Vector3(0, 0, 10);
    gizmo.begin(object, { kind: 'body', hitPoint: grab }, rayTo([0, 0, 10]));
    gizmo.update(rayTo([20, 8, 10]), false);
    expect(current().position[0]).toBeCloseTo(20, 4);
    expect(current().position[1]).toBeCloseTo(8, 4);
    expect(current().position[2]).toBe(0);
    gizmo.end();
  });

  it('keeps the grab offset for a lifted object instead of parallaxing to the bed', () => {
    const object = seedObject('a', { ...IDENTITY_TRANSFORM, position: [0, 0, 60] });
    const gizmo = createGizmo();
    gizmo.begin(object, { kind: 'body', hitPoint: new Vector3(3, 2, 70) }, rayTo([3, 2, 70]));
    gizmo.update(rayTo([13, 2, 70]), false);
    expect(current().position[0]).toBeCloseTo(10, 4);
    expect(current().position[1]).toBeCloseTo(0, 4);
    expect(current().position[2]).toBe(60);
  });

  it('snaps body moves to whole millimeters unless snapping is off', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    gizmo.begin(object, { kind: 'body', hitPoint: new Vector3(0, 0, 10) }, rayTo([0, 0, 10]));
    gizmo.update(rayTo([20.4, 7.6, 10]), true);
    expect(current().position[0]).toBe(20);
    expect(current().position[1]).toBe(8);
    gizmo.update(rayTo([20.4, 7.6, 10]), false);
    expect(current().position[0]).toBeCloseTo(20.4, 3);
  });

  it('moves along one world axis relative to the grab and touches nothing else', () => {
    const object = seedObject('a', { ...IDENTITY_TRANSFORM, position: [10, -4, 0], rotation: [0, 0, 0.4] });
    const start = JSON.parse(JSON.stringify(current()));
    const readout = vi.fn();
    const gizmo = createGizmo(readout);
    const center = [10, -4, 5] as const;
    gizmo.begin(object, { kind: 'arrow', axis: 'x' }, rayTo([center[0] + 30, center[1], center[2]]));
    gizmo.update(rayTo([center[0] + 52, center[1], center[2]]), true);
    expect(current().position[0]).toBeCloseTo(32, 4);
    expect(current().position[1]).toBe(start.position[1]);
    expect(current().position[2]).toBe(start.position[2]);
    expect(current().rotation).toEqual(start.rotation);
    expect(readout).toHaveBeenLastCalledWith('X +22.0 mm');
  });

  it('lifts with the Z arrow and never sinks below the plate', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    gizmo.begin(object, { kind: 'arrow', axis: 'z' }, rayTo([0, 0, 35]));
    gizmo.update(rayTo([0, 0, 55]), true);
    expect(current().position[2]).toBeCloseTo(20, 4);
    expect(current().position[0]).toBe(0);
    gizmo.update(rayTo([0, 0, -80]), true);
    expect(current().position[2]).toBeCloseTo(0, 6);
  });

  it('rotates about the world Z axis, snapped to 15 degrees, changing no other Euler component', () => {
    const object = seedObject('a');
    const readout = vi.fn();
    const gizmo = createGizmo(readout);
    const at = (degrees: number): [number, number, number] => [40 * Math.cos(degrees * Math.PI / 180), 40 * Math.sin(degrees * Math.PI / 180), 5];
    gizmo.begin(object, { kind: 'ring', axis: 'z' }, rayTo(at(0)));
    gizmo.update(rayTo(at(41)), true);
    expect(current().rotation[0]).toBeCloseTo(0, 6);
    expect(current().rotation[1]).toBeCloseTo(0, 6);
    expect(current().rotation[2]).toBeCloseTo(45 * Math.PI / 180, 5);
    expect(current().position[2]).toBeCloseTo(0, 6);
    expect(readout).toHaveBeenLastCalledWith('Z 45.0°');
    gizmo.update(rayTo(at(41)), false);
    expect(current().rotation[2]).toBeCloseTo(41 * Math.PI / 180, 4);
  });

  it('rotates about world X even after a prior Z turn (no intrinsic Euler drift)', () => {
    const object = seedObject('a', { ...IDENTITY_TRANSFORM, rotation: [0, 0, Math.PI / 2] });
    const gizmo = createGizmo();
    const angle = 30 * Math.PI / 180;
    gizmo.begin(object, { kind: 'ring', axis: 'x' }, rayTo([0, 40, 5]));
    gizmo.update(rayTo([0, 40 * Math.cos(angle), 5 + 40 * Math.sin(angle)]), true);
    const expected = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle)
      .multiply(new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2, 'XYZ')));
    const actual = new Quaternion().setFromEuler(new Euler(...current().rotation, 'XYZ'));
    expect(Math.abs(actual.dot(expected))).toBeCloseTo(1, 5);
  });

  describe('ring drag continuity past 180 degrees', () => {
    const at = (degrees: number): [number, number, number] => [40 * Math.cos(degrees * Math.PI / 180), 40 * Math.sin(degrees * Math.PI / 180), 5];

    /**
     * NOTE on what this can and cannot prove: `rotateAboutWorldAxis` applies the angle through
     * `Quaternion.setFromAxisAngle`, which is exactly periodic in its angle argument (period 2*PI) up to a
     * global sign that itself represents the identical rotation matrix. That means a wrapped raw angle of
     * -170deg and a continuous accumulated angle of +190deg produce the IDENTICAL committed 3D orientation
     * (and therefore the identical Euler `rotation[2]` readback) -- there is no per-frame "snap" in the
     * rendered object from this wraparound, for either the old or the new code, as long as the pointer's
     * true per-frame angular travel stays under 180deg. This is verified below. What genuinely differs
     * between the old and the new code is the live angle READOUT shown to the user during the drag: the
     * old code's readout flips sign at the crossing (e.g. "Z 170.0°" -> "Z -170.0°" while still turning the
     * same way), which is the real, user-visible discontinuity this fix removes.
     */
    it('matches each frame\'s true angular step, with no extra jump at the 180-degree wrap', () => {
      const object = seedObject('a');
      const gizmo = createGizmo();
      gizmo.begin(object, { kind: 'ring', axis: 'z' }, rayTo(at(0)));
      let previous = new Quaternion().setFromEuler(new Euler(...current().rotation, 'XYZ'));
      let previousDegrees = 0;
      for (const degrees of [10, 60, 120, 170, 179, 181, 190, 250, 300, 350]) {
        gizmo.update(rayTo(at(degrees)), false);
        const orientation = new Quaternion().setFromEuler(new Euler(...current().rotation, 'XYZ'));
        const stepDegrees = Math.acos(Math.min(1, Math.abs(previous.dot(orientation)))) * 2 * 180 / Math.PI;
        // A real "snap" would show up here as an unexplained extra ~360deg jump at the 179->181 step.
        expect(stepDegrees).toBeCloseTo(degrees - previousDegrees, 1);
        previous = orientation;
        previousDegrees = degrees;
      }
      gizmo.end();
    });

    it('keeps the live angle readout continuous across the wrap instead of flipping sign', () => {
      const object = seedObject('a');
      const readout = vi.fn();
      const gizmo = createGizmo(readout);
      gizmo.begin(object, { kind: 'ring', axis: 'z' }, rayTo(at(0)));
      gizmo.update(rayTo(at(170)), false);
      expect(readout).toHaveBeenLastCalledWith('Z 170.0°');
      gizmo.update(rayTo(at(190)), false);
      // The critical assertion: continuing the same physical sweep must keep the readout climbing
      // ("Z 190.0°"), not flip its sign to "Z -170.0°" as the pre-fix code did.
      expect(readout).toHaveBeenLastCalledWith('Z 190.0°');
      gizmo.update(rayTo(at(350)), false);
      expect(readout).toHaveBeenLastCalledWith('Z 350.0°');
      // Multiple full turns, each frame step kept under 180deg (as a real drag would be sampled).
      for (const degrees of [410, 470, 530, 590, 650, 710, 725]) gizmo.update(rayTo(at(degrees)), false);
      expect(readout).toHaveBeenLastCalledWith('Z 725.0°');
      gizmo.end();
    });

    it('starts a fresh accumulator from zero on release and re-press', () => {
      const object = seedObject('a');
      const readout = vi.fn();
      const gizmo = createGizmo(readout);
      gizmo.begin(object, { kind: 'ring', axis: 'z' }, rayTo(at(0)));
      gizmo.update(rayTo(at(170)), false);
      expect(readout).toHaveBeenLastCalledWith('Z 170.0°');
      gizmo.end();

      gizmo.begin(object, { kind: 'ring', axis: 'z' }, rayTo(at(170)));
      gizmo.update(rayTo(at(190)), false);
      expect(readout).toHaveBeenLastCalledWith('Z 20.0°'); // fresh session: only the new 20deg sweep, not 190.
      gizmo.end();
    });

    it('freezes (never jumps) when the ring plane is grazed mid-drag, then resumes continuously', () => {
      const object = seedObject('a');
      const readout = vi.fn();
      const gizmo = createGizmo(readout);
      gizmo.begin(object, { kind: 'ring', axis: 'z' }, rayTo(at(0)));
      gizmo.update(rayTo(at(20)), false);
      expect(readout).toHaveBeenLastCalledWith('Z 20.0°');

      // A near-horizontal look direction grazes the z-normal ring plane (mirrors the drag-math.test.ts
      // "ignores a ring seen exactly edge-on" setup), so `ringVector` returns undefined for this frame.
      const edgeOnCamera = new PerspectiveCamera(45, 1, 1, 2000);
      edgeOnCamera.up.set(0, 0, 1);
      edgeOnCamera.position.set(0, -200, 0);
      edgeOnCamera.lookAt(0, 0, 0);
      edgeOnCamera.updateMatrixWorld();
      const grazingRay = rayFromNdc(edgeOnCamera, 0.3, 0);

      gizmo.update(grazingRay, false);
      expect(readout).toHaveBeenLastCalledWith('Z 20.0°'); // frozen, not jumped/reset

      gizmo.update(rayTo(at(35)), false);
      expect(readout).toHaveBeenLastCalledWith('Z 35.0°'); // resumes the same accumulator
      gizmo.end();
    });
  });

  it('cancel() restores the transform from before the gesture', () => {
    const object = seedObject('a');
    const before = JSON.stringify(current());
    const gizmo = createGizmo();
    gizmo.begin(object, { kind: 'body', hitPoint: new Vector3(0, 0, 10) }, rayTo([0, 0, 10]));
    gizmo.update(rayTo([30, 30, 10]), false);
    expect(JSON.stringify(current())).not.toBe(before);
    gizmo.cancel();
    expect(JSON.stringify(current())).toBe(before);
    expect(gizmo.active).toBe(false);
  });
});
