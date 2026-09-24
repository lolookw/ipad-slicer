import {
  Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, TorusGeometry, Vector3, type PerspectiveCamera,
} from 'three';
import { AXIS_COLORS, AXIS_NAMES, axisVector, type AxisName } from './axis';
import { distanceToPolyline2D, distanceToSegment2D, worldPerPixel } from './drag-math';

/** All sizes below are CSS pixels: the group is rescaled every frame so they stay constant on screen. */
export const ARROW_LENGTH_PX = 110;
export const RING_RADIUS_PX = 90;
/** Half of the 44 px minimum touch target. */
export const HIT_RADIUS_PX = 22;
const ARROW_HEAD_PX = 22;
const ARROW_HEAD_RADIUS_PX = 7;
const SHAFT_RADIUS_PX = 2.2;
const RING_TUBE_PX = 2;
const RING_SAMPLES = 72;
/** Arrows win over rings where they cross, so a press on the crossing moves rather than rotates. */
const ARROW_BIAS_PX = 6;

export interface GizmoHandle { kind: 'arrow' | 'ring'; axis: AxisName }
export const sameHandle = (a: GizmoHandle | undefined, b: GizmoHandle | undefined) => a?.kind === b?.kind && a?.axis === b?.axis;

/**
 * Which handle kind is currently interactive, mirroring the mode toolbar (Select/Move/Rotate):
 * 'select' shows/hits neither (direct body drag only, gestures.ts is unaffected), 'move' is arrows
 * only, 'rotate' is rings only. 'both' is the pre-mode-toolbar behavior (every handle at once) and
 * exists only as `hitTestLayout`'s default so its existing direct callers/tests stay unchanged.
 */
export type GizmoMode = 'select' | 'move' | 'rotate' | 'both';

/** Basis of each ring's plane: the ring for axis A turns about A, so it lies in the other two axes. */
const RING_BASIS: Record<AxisName, [AxisName, AxisName]> = { x: ['y', 'z'], y: ['z', 'x'], z: ['x', 'y'] };

export interface GizmoLayout {
  center: [number, number];
  arrows: Record<AxisName, { tip: [number, number] }>;
  rings: Record<AxisName, [number, number][]>;
}

export interface GizmoView {
  readonly root: Group;
  /** World point the gizmo is anchored to, or undefined to hide it. */
  setCenter(center: Vector3 | undefined): void;
  readonly center: Vector3 | undefined;
  /** Re-anchors and rescales to constant screen size; call whenever the camera or viewport changed. */
  sync(camera: PerspectiveCamera, widthPx: number, heightPx: number): void;
  layout(camera: PerspectiveCamera, widthPx: number, heightPx: number): GizmoLayout | undefined;
  hitTest(xPx: number, yPx: number, camera: PerspectiveCamera, widthPx: number, heightPx: number): GizmoHandle | undefined;
  setHover(handle: GizmoHandle | undefined): boolean;
  setPressed(handle: GizmoHandle | undefined): boolean;
  /** Switches which handle kind is drawn and hit-testable; returns whether it actually changed. */
  setMode(mode: GizmoMode): boolean;
  dispose(): void;
}

function project(point: Vector3, camera: PerspectiveCamera, widthPx: number, heightPx: number): [number, number] {
  const ndc = point.clone().project(camera);
  return [(ndc.x + 1) / 2 * widthPx, (1 - ndc.y) / 2 * heightPx];
}

export function computeGizmoLayout(center: Vector3, camera: PerspectiveCamera, widthPx: number, heightPx: number): GizmoLayout {
  camera.updateMatrixWorld();
  const scale = worldPerPixel(camera, center, heightPx);
  const arrows = {} as GizmoLayout['arrows'];
  const rings = {} as GizmoLayout['rings'];
  for (const axis of AXIS_NAMES) {
    arrows[axis] = { tip: project(center.clone().addScaledVector(axisVector(axis), ARROW_LENGTH_PX * scale), camera, widthPx, heightPx) };
    const [u, v] = RING_BASIS[axis].map(axisVector) as [Vector3, Vector3];
    rings[axis] = Array.from({ length: RING_SAMPLES }, (_, i) => {
      const angle = i / RING_SAMPLES * Math.PI * 2;
      const point = center.clone().addScaledVector(u, Math.cos(angle) * RING_RADIUS_PX * scale).addScaledVector(v, Math.sin(angle) * RING_RADIUS_PX * scale);
      return project(point, camera, widthPx, heightPx);
    });
  }
  return { center: project(center, camera, widthPx, heightPx), arrows, rings };
}

/**
 * Nearest handle within the touch radius; arrows are favored where they overlap a ring.
 * `mode` restricts which handle kind is even considered (the mode toolbar's Select/Move/Rotate);
 * it defaults to 'both' so every pre-existing direct caller (including this file's own tests) keeps
 * matching arrows and rings exactly as before.
 */
export function hitTestLayout(layout: GizmoLayout, xPx: number, yPx: number, radiusPx = HIT_RADIUS_PX, mode: GizmoMode = 'both'): GizmoHandle | undefined {
  if (mode === 'select') return undefined;
  let best: { handle: GizmoHandle; score: number } | undefined;
  const consider = (handle: GizmoHandle, distance: number) => {
    if (distance > radiusPx) return;
    const score = distance - (handle.kind === 'arrow' ? ARROW_BIAS_PX : 0);
    if (!best || score < best.score) best = { handle, score };
  };
  for (const axis of AXIS_NAMES) {
    if (mode === 'both' || mode === 'move') {
      const tip = layout.arrows[axis].tip;
      consider({ kind: 'arrow', axis }, distanceToSegment2D(xPx, yPx, layout.center[0], layout.center[1], tip[0], tip[1]));
    }
    if (mode === 'both' || mode === 'rotate') consider({ kind: 'ring', axis }, distanceToPolyline2D(xPx, yPx, layout.rings[axis], true));
  }
  return best?.handle;
}

/** A point on the ring that is farthest from every other handle: a reliable spot to grab it. */
export function ringGrabPoint(layout: GizmoLayout, axis: AxisName): [number, number] {
  let best: { point: [number, number]; clearance: number } | undefined;
  for (const point of layout.rings[axis]) {
    let clearance = Infinity;
    for (const other of AXIS_NAMES) {
      clearance = Math.min(clearance, distanceToSegment2D(point[0], point[1], layout.center[0], layout.center[1], layout.arrows[other].tip[0], layout.arrows[other].tip[1]) - ARROW_BIAS_PX);
      if (other !== axis) clearance = Math.min(clearance, distanceToPolyline2D(point[0], point[1], layout.rings[other], true));
    }
    if (!best || clearance > best.clearance) best = { point, clearance };
  }
  return best!.point;
}

const Y = new Vector3(0, 1, 0);
const WHITE = new Color(0xffffff);

export function createGizmoView(): GizmoView {
  const root = new Group();
  root.name = 'transform-gizmo';
  root.visible = false;
  const materials = new Map<string, { material: MeshBasicMaterial; base: Color }>();
  const handleMeshes = new Map<string, Mesh[]>();
  const geometries: { dispose(): void }[] = [];
  const key = (handle: GizmoHandle) => `${handle.kind}:${handle.axis}`;
  const build = (handle: GizmoHandle): Mesh[] => {
    const base = new Color(AXIS_COLORS[handle.axis]);
    const material = new MeshBasicMaterial({ color: base.clone(), depthTest: false, depthWrite: false, transparent: true });
    materials.set(key(handle), { material, base });
    const orientation = new Quaternion().setFromUnitVectors(Y, axisVector(handle.axis));
    const meshes: Mesh[] = [];
    if (handle.kind === 'arrow') {
      const shaft = new CylinderGeometry(SHAFT_RADIUS_PX, SHAFT_RADIUS_PX, ARROW_LENGTH_PX - ARROW_HEAD_PX, 10);
      shaft.translate(0, (ARROW_LENGTH_PX - ARROW_HEAD_PX) / 2, 0);
      const head = new ConeGeometry(ARROW_HEAD_RADIUS_PX, ARROW_HEAD_PX, 16);
      head.translate(0, ARROW_LENGTH_PX - ARROW_HEAD_PX / 2, 0);
      geometries.push(shaft, head);
      meshes.push(new Mesh(shaft, material), new Mesh(head, material));
    } else {
      // TorusGeometry lies in the XY plane (normal +Z); rotate its normal onto the ring axis.
      const torus = new TorusGeometry(RING_RADIUS_PX, RING_TUBE_PX, 8, RING_SAMPLES);
      geometries.push(torus);
      const mesh = new Mesh(torus, material);
      mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axisVector(handle.axis));
      meshes.push(mesh);
    }
    for (const mesh of meshes) {
      if (handle.kind === 'arrow') mesh.quaternion.copy(orientation);
      mesh.renderOrder = handle.kind === 'ring' ? 20 : 21;
      root.add(mesh);
    }
    handleMeshes.set(key(handle), meshes);
    return meshes;
  };
  for (const axis of AXIS_NAMES) { build({ kind: 'ring', axis }); build({ kind: 'arrow', axis }); }

  let center: Vector3 | undefined;
  let hover: GizmoHandle | undefined;
  let pressed: GizmoHandle | undefined;
  // Select shows neither handle kind by default (the mode toolbar's default mode): fewer handles
  // drawn/hit-tested until Move or Rotate is chosen, matching the product ask that the gizmo stop
  // crowding the (still small) viewport by default.
  let mode: GizmoMode = 'select';
  const applyModeVisibility = () => {
    for (const axis of AXIS_NAMES) for (const kind of ['arrow', 'ring'] as const) {
      const visible = mode === 'both' || (kind === 'arrow' ? mode === 'move' : mode === 'rotate');
      for (const mesh of handleMeshes.get(key({ kind, axis }))!) mesh.visible = visible;
    }
  };
  applyModeVisibility();
  const paint = () => {
    for (const axis of AXIS_NAMES) for (const kind of ['arrow', 'ring'] as const) {
      const handle = { kind, axis };
      const entry = materials.get(key(handle))!;
      const level = sameHandle(handle, pressed) ? 0.6 : sameHandle(handle, hover) ? 0.35 : 0;
      entry.material.color.copy(entry.base).lerp(WHITE, level);
    }
  };

  return {
    root,
    get center() { return center; },
    setCenter(next) { center = next?.clone(); root.visible = center !== undefined; },
    sync(camera, widthPx, heightPx) {
      if (!center) return;
      root.position.copy(center);
      root.scale.setScalar(worldPerPixel(camera, center, heightPx));
    },
    // Unfiltered by mode on purpose: scene.ts publishes this raw layout on the canvas for tests/diagnostics
    // regardless of which handles are currently interactive, so it always reflects real screen positions.
    layout(camera, widthPx, heightPx) { return center ? computeGizmoLayout(center, camera, widthPx, heightPx) : undefined; },
    hitTest(xPx, yPx, camera, widthPx, heightPx) {
      const layout = center ? computeGizmoLayout(center, camera, widthPx, heightPx) : undefined;
      return layout ? hitTestLayout(layout, xPx, yPx, HIT_RADIUS_PX, mode) : undefined;
    },
    setHover(handle) { if (sameHandle(handle, hover)) return false; hover = handle; paint(); return true; },
    setPressed(handle) { if (sameHandle(handle, pressed)) return false; pressed = handle; paint(); return true; },
    setMode(next) { if (next === mode) return false; mode = next; applyModeVisibility(); return true; },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const { material } of materials.values()) material.dispose();
    },
  };
}
