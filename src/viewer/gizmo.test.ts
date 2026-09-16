import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { plate } from '../app/stores/plate';
import { createGizmo, hitsSelected } from './gizmo';
import { IDENTITY_TRANSFORM, type ObjectTransform } from './transforms';

function topDownCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function seedObject(id: string, transform: ObjectTransform = IDENTITY_TRANSFORM) {
  plate.addObject({ id, name: id, transform, triangleCount: 12, bounds: { min: [-5, -5, 0], max: [5, 5, 10] } });
  return plate.state.objects.find((object) => object.id === id)!;
}

beforeEach(() => { plate.clear(); });

describe('createGizmo', () => {
  it('tracks the locked object only between begin() and end()', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    expect(gizmo.active).toBe(false);
    gizmo.begin(object, 'rotate', 0, 0, topDownCamera());
    expect(gizmo.active).toBe(true);
    expect(gizmo.lockedObjectId).toBe('a');
    gizmo.end();
    expect(gizmo.active).toBe(false);
    expect(gizmo.lockedObjectId).toBeUndefined();
  });

  it('moves the object across the bed plane toward the pointer, keeping it seated at z=0', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    const camera = topDownCamera();
    gizmo.begin(object, 'move', 0, 0, camera);
    gizmo.moveTo(0.2, 0, camera);
    const moved = plate.state.objects.find((item) => item.id === 'a')!;
    expect(moved.transform.position[0]).toBeGreaterThan(0);
    expect(moved.transform.position[2]).toBeCloseTo(0);
  });

  it('ignores moveTo/scaleBy while a rotate gesture is active, and vice versa', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    const camera = topDownCamera();
    gizmo.begin(object, 'rotate', 0, 0, camera);
    gizmo.moveTo(0.5, 0.5, camera);
    gizmo.scaleBy(2);
    const untouched = plate.state.objects.find((item) => item.id === 'a')!;
    expect(untouched.transform.position).toEqual(IDENTITY_TRANSFORM.position);
    expect(untouched.transform.scale).toEqual(IDENTITY_TRANSFORM.scale);
  });

  it('applies a cumulative rotation about Z since begin(), not a per-call delta', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    const camera = topDownCamera();
    gizmo.begin(object, 'rotate', 0, 0, camera);
    gizmo.rotateBy(0.3);
    gizmo.rotateBy(0.7);
    const rotated = plate.state.objects.find((item) => item.id === 'a')!;
    expect(rotated.transform.rotation[2]).toBeCloseTo(0.7);
  });

  it('applies a cumulative uniform scale since begin(), clamped above the minimum', () => {
    const object = seedObject('a');
    const gizmo = createGizmo();
    const camera = topDownCamera();
    gizmo.begin(object, 'scale', 0, 0, camera);
    gizmo.scaleBy(0);
    const scaled = plate.state.objects.find((item) => item.id === 'a')!;
    expect(scaled.transform.scale[0]).toBeGreaterThan(0);
    expect(scaled.transform.scale[0]).toBeCloseTo(scaled.transform.scale[1]);
  });
});

describe('hitsSelected', () => {
  it('reports a hit only when the ray from the given NDC point crosses the mesh', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const camera = topDownCamera();
    expect(hitsSelected(0, 0, camera, mesh)).toBe(true);
    expect(hitsSelected(0.99, 0.99, camera, mesh)).toBe(false);
  });
});
