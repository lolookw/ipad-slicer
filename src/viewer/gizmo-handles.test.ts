import { Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AXIS_COLORS, AXIS_NAMES } from './axis';
import { ARROW_LENGTH_PX, HIT_RADIUS_PX, RING_RADIUS_PX, computeGizmoLayout, createGizmoView, hitTestLayout, ringGrabPoint } from './gizmo-handles';

const SIZE = 800;
function camera(distance: number): PerspectiveCamera {
  const value = new PerspectiveCamera(45, 1, 1, 5000);
  value.up.set(0, 0, 1);
  value.position.set(distance * 0.55, -distance * 0.75, distance * 0.6);
  value.lookAt(0, 0, 0);
  value.updateMatrixWorld();
  return value;
}
const center = new Vector3(0, 0, 0);

describe('gizmo layout', () => {
  it('keeps arrows and rings a constant size on screen at any zoom', () => {
    for (const distance of [150, 400, 1200]) {
      const view = camera(distance);
      const layout = computeGizmoLayout(center, view, SIZE, SIZE);
      // The Z arrow points mostly along the screen's vertical; each arrow's on-screen length stays near 110 px (foreshortening only shortens it).
      for (const axis of AXIS_NAMES) {
        const tip = layout.arrows[axis].tip;
        const length = Math.hypot(tip[0] - layout.center[0], tip[1] - layout.center[1]);
        expect(length).toBeLessThanOrEqual(ARROW_LENGTH_PX + 1);
        expect(length).toBeGreaterThan(ARROW_LENGTH_PX * 0.3);
      }
      const radii = layout.rings.z.map(point => Math.hypot(point[0] - layout.center[0], point[1] - layout.center[1]));
      expect(Math.max(...radii)).toBeGreaterThan(RING_RADIUS_PX * 0.9);
      expect(Math.max(...radii)).toBeLessThan(RING_RADIUS_PX * 1.1);
    }
  });

  it('offers touch targets of at least 44 px', () => {
    expect(HIT_RADIUS_PX * 2).toBeGreaterThanOrEqual(44);
    const layout = computeGizmoLayout(center, camera(400), SIZE, SIZE);
    const tip = layout.arrows.x.tip;
    expect(hitTestLayout(layout, tip[0] + 20, tip[1])).toEqual({ kind: 'arrow', axis: 'x' });
    expect(hitTestLayout(layout, tip[0] + 60, tip[1] + 60)).toBeUndefined();
  });

  it('picks the ring at a grab point clear of every other handle', () => {
    const layout = computeGizmoLayout(center, camera(400), SIZE, SIZE);
    for (const axis of AXIS_NAMES) {
      const [x, y] = ringGrabPoint(layout, axis);
      expect(hitTestLayout(layout, x, y)).toEqual({ kind: 'ring', axis });
    }
  });

  it('favors an arrow over a ring where they cross', () => {
    const layout = computeGizmoLayout(center, camera(400), SIZE, SIZE);
    const onZRing = layout.rings.z.reduce((best, point) => Math.hypot(point[0] - layout.arrows.x.tip[0] * 0.8 - layout.center[0] * 0.2, point[1] - layout.arrows.x.tip[1] * 0.8 - layout.center[1] * 0.2) <
      Math.hypot(best[0] - layout.arrows.x.tip[0] * 0.8 - layout.center[0] * 0.2, best[1] - layout.arrows.x.tip[1] * 0.8 - layout.center[1] * 0.2) ? point : best);
    expect(hitTestLayout(layout, onZRing[0], onZRing[1])?.kind).toBe('arrow');
  });

  it('restricts hits to one handle kind per mode toolbar mode, and to none in select mode', () => {
    const layout = computeGizmoLayout(center, camera(400), SIZE, SIZE);
    const tip = layout.arrows.x.tip;
    const arrowPoint: [number, number] = [tip[0] + 20, tip[1]]; // same point the "44 px touch target" test above confirms hits only the arrow
    const ringPoint = ringGrabPoint(layout, 'z'); // "clear of every other handle" by construction
    // The exact point the "favors an arrow over a ring" test above proves is within radius of BOTH
    // the X arrow and the Z ring at once (arrow wins there when both are candidates): the strongest
    // proof a mode filter actually suppresses a handle, rather than merely finding nothing nearby.
    const crossing = layout.rings.z.reduce((best, point) => Math.hypot(point[0] - tip[0] * 0.8 - layout.center[0] * 0.2, point[1] - tip[1] * 0.8 - layout.center[1] * 0.2) <
      Math.hypot(best[0] - tip[0] * 0.8 - layout.center[0] * 0.2, best[1] - tip[1] * 0.8 - layout.center[1] * 0.2) ? point : best);

    expect(hitTestLayout(layout, arrowPoint[0], arrowPoint[1], HIT_RADIUS_PX, 'move')).toEqual({ kind: 'arrow', axis: 'x' });
    expect(hitTestLayout(layout, ringPoint[0], ringPoint[1], HIT_RADIUS_PX, 'move')).toBeUndefined();
    expect(hitTestLayout(layout, crossing[0], crossing[1], HIT_RADIUS_PX, 'move')).toEqual({ kind: 'arrow', axis: 'x' });

    expect(hitTestLayout(layout, ringPoint[0], ringPoint[1], HIT_RADIUS_PX, 'rotate')).toEqual({ kind: 'ring', axis: 'z' });
    // Same pixel as the 'move' assertion above, which resolved to the arrow: with the arrow excluded,
    // a ring now wins instead (which axis is incidental here — the crossing point sits near more than
    // one ring at this camera angle — what matters is that it flips from 'arrow' to 'ring').
    expect(hitTestLayout(layout, crossing[0], crossing[1], HIT_RADIUS_PX, 'rotate')?.kind).toBe('ring');

    expect(hitTestLayout(layout, crossing[0], crossing[1], HIT_RADIUS_PX, 'select')).toBeUndefined();
    expect(hitTestLayout(layout, arrowPoint[0], arrowPoint[1], HIT_RADIUS_PX, 'select')).toBeUndefined();
    expect(hitTestLayout(layout, ringPoint[0], ringPoint[1], HIT_RADIUS_PX, 'select')).toBeUndefined();
  });
});

describe('gizmo view', () => {
  it('is hidden without a center, follows it, and rescales with distance', () => {
    const view = createGizmoView();
    expect(view.root.visible).toBe(false);
    view.setCenter(new Vector3(10, 20, 30));
    expect(view.root.visible).toBe(true);
    view.sync(camera(200), SIZE, SIZE);
    const near = view.root.scale.x;
    expect(view.root.position.toArray()).toEqual([10, 20, 30]);
    view.sync(camera(800), SIZE, SIZE);
    expect(view.root.scale.x).toBeGreaterThan(near * 2);
    view.setCenter(undefined);
    expect(view.root.visible).toBe(false);
    view.dispose();
  });

  it('draws red/green/blue handles without depth testing and brightens on hover and press', () => {
    const view = createGizmoView();
    const materials = new Set(view.root.children.map(child => (child as Mesh).material as MeshBasicMaterial));
    expect(materials.size).toBe(6);
    for (const material of materials) expect(material.depthTest).toBe(false);
    for (const axis of AXIS_NAMES) expect([...materials].some(material => material.color.getHex() === AXIS_COLORS[axis])).toBe(true);

    expect(view.setHover({ kind: 'arrow', axis: 'x' })).toBe(true);
    expect(view.setHover({ kind: 'arrow', axis: 'x' })).toBe(false);
    const brightened = [...materials].filter(material => material.color.getHex() !== AXIS_COLORS.x && material.color.r > 0.9 && material.color.g > 0.3);
    expect(brightened.length).toBeGreaterThan(0);
    view.setPressed({ kind: 'ring', axis: 'z' });
    view.setHover(undefined);
    view.setPressed(undefined);
    for (const axis of AXIS_NAMES) expect([...materials].some(material => material.color.getHex() === AXIS_COLORS[axis])).toBe(true);
    view.dispose();
  });

  it('defaults to select mode (no handle drawn or hit-testable) and setMode switches both drawing and hit-testing together', () => {
    const view = createGizmoView();
    view.setCenter(center);
    const arrows = () => view.root.children.filter(child => (child as Mesh).geometry.type !== 'TorusGeometry');
    const rings = () => view.root.children.filter(child => (child as Mesh).geometry.type === 'TorusGeometry');
    expect(arrows().every(mesh => (mesh as Mesh).visible === false)).toBe(true);
    expect(rings().every(mesh => (mesh as Mesh).visible === false)).toBe(true);
    expect(view.hitTest(0, 0, camera(400), SIZE, SIZE)).toBeUndefined();

    expect(view.setMode('move')).toBe(true);
    expect(view.setMode('move')).toBe(false); // no-op, already that mode
    expect(arrows().every(mesh => (mesh as Mesh).visible === true)).toBe(true);
    expect(rings().every(mesh => (mesh as Mesh).visible === false)).toBe(true);
    const layout = view.layout(camera(400), SIZE, SIZE)!;
    const tip = layout.arrows.x.tip;
    const arrowPoint: [number, number] = [tip[0] + 20, tip[1]];
    const ringPoint = ringGrabPoint(layout, 'z'); // clear of every other handle by construction
    expect(view.hitTest(arrowPoint[0], arrowPoint[1], camera(400), SIZE, SIZE)).toEqual({ kind: 'arrow', axis: 'x' });

    view.setMode('rotate');
    expect(arrows().every(mesh => (mesh as Mesh).visible === false)).toBe(true);
    expect(rings().every(mesh => (mesh as Mesh).visible === true)).toBe(true);
    expect(view.hitTest(ringPoint[0], ringPoint[1], camera(400), SIZE, SIZE)).toEqual({ kind: 'ring', axis: 'z' });
    view.dispose();
  });
});
