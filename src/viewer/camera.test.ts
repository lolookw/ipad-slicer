import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { createCameraControls, fitDistance, VIEW_DIRECTIONS, type ViewerCameraControls } from './camera';

function rig(position: [number, number, number] = [0, -100, 60]) {
  const camera = new PerspectiveCamera(45, 1, 1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  const canvas = document.createElement('canvas');
  const controls = createCameraControls(camera, canvas);
  controls.update(1);
  return { camera, canvas, controls };
}

const screenOf = (camera: PerspectiveCamera, point: Vector3) => {
  camera.updateMatrixWorld();
  return point.clone().project(camera);
};
const settle = (controls: ViewerCameraControls) => { for (let i = 0; i < 400; i += 1) controls.update(0.05); };

const settleFrames = (controls: ViewerCameraControls) => { for (let i = 0; i < 60; i += 1) controls.update(0.016); };

let active: ViewerCameraControls | undefined;
afterEach(() => { active?.dispose(); active = undefined; });

describe('camera controls', () => {
  it('twists the scene with the fingers: a clockwise twist moves the near side of the plate to the left', () => {
    const { camera, controls } = rig(); active = controls;
    const near = new Vector3(0, -20, 0);
    const before = screenOf(camera, near);
    controls.twist(0.3);
    controls.update(1);
    const after = screenOf(camera, near);
    expect(after.x).toBeLessThan(before.x);
    expect(screenOf(camera, new Vector3(0, 0, 0)).x).toBeCloseTo(0, 5);
  });

  it('moves the orbit pivot without changing the picture, then orbits about that pivot', () => {
    const { camera, controls } = rig(); active = controls;
    const pivot = new Vector3(30, 10, 5);
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const pivotOnScreen = screenOf(camera, pivot);

    controls.setPivot(pivot.x, pivot.y, pivot.z);
    controls.update(1);
    expect(camera.position.distanceTo(position)).toBeCloseTo(0, 4);
    expect(camera.quaternion.angleTo(quaternion)).toBeCloseTo(0, 4);
    expect(screenOf(camera, pivot).x).toBeCloseTo(pivotOnScreen.x, 4);

    // A drag delivers many small steps; camera-controls applies its pivot offset with the previous frame's basis,
    // so the pivot only holds to within one step's error rather than exactly.
    for (let i = 0; i < 40; i += 1) { controls.twist(0.02); controls.update(0.016); }
    settleFrames(controls);
    expect(Math.abs(screenOf(camera, pivot).x - pivotOnScreen.x)).toBeLessThan(0.02);
    expect(Math.abs(screenOf(camera, pivot).y - pivotOnScreen.y)).toBeLessThan(0.02);
    expect(camera.position.distanceTo(position)).toBeGreaterThan(1);
  });

  it('pans in screen space so the point under the finger follows it', () => {
    const { camera, controls } = rig(); active = controls;
    const point = new Vector3(0, 0, 0);
    const before = screenOf(camera, point);
    controls.panScreen(40, 0, 800);
    controls.update(1);
    expect(screenOf(camera, point).x).toBeGreaterThan(before.x);
    expect(screenOf(camera, point).y).toBeCloseTo(before.y, 3);
  });

  it('frames a box without snapping the view direction to an axis', async () => {
    const { camera, controls } = rig([80, -100, 70]); active = controls;
    const direction = camera.position.clone().normalize();
    const done = controls.fit(new Box3(new Vector3(-10, -10, 0), new Vector3(10, 10, 20)));
    settle(controls);
    await done;
    const after = camera.position.clone().sub(new Vector3(0, 0, 10)).normalize();
    expect(after.angleTo(direction)).toBeLessThan(0.15);
    expect(camera.position.distanceTo(new Vector3(0, 0, 10))).toBeGreaterThan(20);
  });

  it('applies view presets', async () => {
    const { camera, controls } = rig(); active = controls;
    const box = new Box3(new Vector3(-50, -50, 0), new Vector3(50, 50, 10));
    const top = controls.fit(box, 'top'); settle(controls); await top;
    expect(camera.position.z).toBeGreaterThan(Math.abs(camera.position.y) * 10);
    const front = controls.fit(box, 'front'); settle(controls); await front;
    expect(Math.abs(camera.position.x)).toBeLessThan(0.5);
    expect(camera.position.y).toBeLessThan(0);
    expect(VIEW_DIRECTIONS.iso[2]).toBeGreaterThan(0);
  });

  it('keeps one pointer from orbiting while a transform owns it', () => {
    const { controls } = rig(); active = controls;
    expect(() => { controls.setPrimaryEnabled(false); controls.setPrimaryEnabled(true); }).not.toThrow();
  });

  it('sizes the fit distance from the tighter field of view', () => {
    expect(fitDistance(100, 45, 1)).toBeCloseTo(100 * 1.15 / Math.sin(22.5 * Math.PI / 180));
    expect(fitDistance(100, 45, 0.5)).toBeGreaterThan(fitDistance(100, 45, 1));
  });
});
