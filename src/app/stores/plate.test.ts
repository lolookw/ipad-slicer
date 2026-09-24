import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDENTITY_TRANSFORM, type LocalBounds, type ObjectTransform } from '../../viewer/transforms';
import { plate, selectedObject } from './plate';

/**
 * Local bounds whose min corner is NOT at the mesh origin (min.z = 2, not 0) — this is what actually
 * exposes the dropToBed-misuse bug below. A mesh imported with its bottom already at local z = 0 (as
 * every other synthetic test fixture in this codebase happens to be built) hides the bug for an
 * identity rotation, because the "stale position.z leaks through" formula error is multiplied by zero.
 */
const BOUNDS: LocalBounds = { min: [-5, -5, 2], max: [5, 5, 12] };

/** Independent oracle for "is this object actually resting on the plate" — raw three.js math, no
 * production dropToBed/seatOnBed code reused, so it can't agree with a shared bug. */
function worldMinZ(bounds: LocalBounds, transform: ObjectTransform): number {
  const matrix = new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation)),
    new Vector3(...(transform.scale.map((value, index) => (transform.mirror[index] ? -value : value)) as [number, number, number])),
  );
  let minZ = Infinity;
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]])
    minZ = Math.min(minZ, new Vector3(x, y, z).applyMatrix4(matrix).z);
  return minZ;
}

describe('plate store keeps objects seated on the plate (world Z = 0)', () => {
  beforeEach(() => plate.clear());

  it('addObject seats a rotated object at world Z = 0 regardless of the incoming position.z', () => {
    plate.addObject({
      id: 'a', name: 'a', bounds: BOUNDS, triangleCount: 12,
      transform: { position: [3, 4, 99], rotation: [Math.PI / 5, Math.PI / 7, 0], scale: [1, 1, 1], mirror: [false, false, false] },
    });

    expect(worldMinZ(BOUNDS, selectedObject()!.transform)).toBeCloseTo(0, 4);
  });

  it('rotate90 keeps the object seated at world Z = 0 across two successive rotations', () => {
    plate.addObject({ id: 'a', name: 'a', bounds: BOUNDS, triangleCount: 12, transform: IDENTITY_TRANSFORM });
    expect(worldMinZ(BOUNDS, selectedObject()!.transform)).toBeCloseTo(0, 4); // sanity: the fixture itself starts seated

    plate.rotate90('a', 'x');
    expect(worldMinZ(BOUNDS, plate.state.objects[0]!.transform)).toBeCloseTo(0, 4);

    // A second rotation from the first's (now non-zero) resting position.z is what exposed the bug:
    // the stale position.z from the first rotation leaked into the second dropToBed call.
    plate.rotate90('a', 'y');
    expect(worldMinZ(BOUNDS, plate.state.objects[0]!.transform)).toBeCloseTo(0, 4);
  });

  it('a generic updateTransform (e.g. committing a scale change) re-seats by default', () => {
    plate.addObject({ id: 'a', name: 'a', bounds: BOUNDS, triangleCount: 12, transform: { ...IDENTITY_TRANSFORM, rotation: [Math.PI / 6, 0, 0] } });
    const current = selectedObject()!.transform;

    plate.updateTransform('a', { ...current, scale: [2, 2, 2] });

    expect(worldMinZ(BOUNDS, plate.state.objects[0]!.transform)).toBeCloseTo(0, 4);
  });

  it('updateTransform with { dropToBed: false } (a live gizmo drag) is left exactly as given', () => {
    plate.addObject({ id: 'a', name: 'a', bounds: BOUNDS, triangleCount: 12, transform: IDENTITY_TRANSFORM });
    const lifted: ObjectTransform = { ...selectedObject()!.transform, position: [1, 2, 500] };

    plate.updateTransform('a', lifted, { dropToBed: false });

    expect(plate.state.objects[0]!.transform).toEqual(lifted);
  });

  it('duplicateObject copies an already-seated transform verbatim and stays seated', () => {
    plate.addObject({ id: 'a', name: 'a', bounds: BOUNDS, triangleCount: 12, transform: { ...IDENTITY_TRANSFORM, rotation: [Math.PI / 4, 0, 0] } });

    plate.duplicateObject('a', 'b');

    const copy = plate.state.objects.find(object => object.id === 'b')!;
    expect(worldMinZ(BOUNDS, copy.transform)).toBeCloseTo(0, 4);
  });
});

describe('plate store Models list actions', () => {
  beforeEach(() => plate.clear());

  it('is visible by default and setVisible toggles it without touching other objects', () => {
    plate.addObject({ id: 'a', name: 'a', bounds: BOUNDS, triangleCount: 12, transform: IDENTITY_TRANSFORM });
    plate.addObject({ id: 'b', name: 'b', bounds: BOUNDS, triangleCount: 12, transform: IDENTITY_TRANSFORM });
    expect(plate.state.objects[0]!.visible).not.toBe(false);

    plate.setVisible('a', false);

    expect(plate.state.objects.find(object => object.id === 'a')!.visible).toBe(false);
    expect(plate.state.objects.find(object => object.id === 'b')!.visible).not.toBe(false);

    plate.setVisible('a', true);
    expect(plate.state.objects.find(object => object.id === 'a')!.visible).toBe(true);
  });

  it('renameObject trims the new name and ignores an empty one', () => {
    plate.addObject({ id: 'a', name: 'original.stl', bounds: BOUNDS, triangleCount: 12, transform: IDENTITY_TRANSFORM });

    plate.renameObject('a', '  Renamed.stl  ');
    expect(plate.state.objects[0]!.name).toBe('Renamed.stl');

    plate.renameObject('a', '   ');
    expect(plate.state.objects[0]!.name).toBe('Renamed.stl');
  });
});
