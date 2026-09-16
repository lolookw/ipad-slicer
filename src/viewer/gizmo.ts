import { Mesh, Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import { plate, type PlateObject } from '../app/stores/plate';
import type { ObjectTransform } from './transforms';

export type GizmoMode = 'move' | 'rotate' | 'scale';

interface GizmoSession {
  objectId: string;
  mode: GizmoMode;
  startTransform: ObjectTransform;
  /** 'move' only: the bed-plane point (world mm) under the pointer when the gesture began. */
  startPoint: Vector3;
}

export interface Gizmo {
  /** True while a gesture owns the selected object; `gestures.ts` (task 6.3) must check this
   * before handing a pointer that started on the selection to camera-controls (design.md's
   * gizmo behavior row: "controls.enabled=false until it ends"). */
  readonly active: boolean;
  readonly lockedObjectId: string | undefined;
  begin(object: PlateObject, mode: GizmoMode, ndcX: number, ndcY: number, camera: PerspectiveCamera): void;
  /** 'move' gestures only. Absolute pointer position each call (not incremental) to avoid drift. */
  moveTo(ndcX: number, ndcY: number, camera: PerspectiveCamera): void;
  /** 'rotate' gestures only. Cumulative angle about Z since `begin()`, not a per-call delta. */
  rotateBy(radiansSinceBegin: number): void;
  /** 'scale' gestures only. Cumulative uniform multiplier since `begin()`, not a per-call delta. */
  scaleBy(factorSinceBegin: number): void;
  end(): void;
}

const BED_PLANE = new Plane(new Vector3(0, 0, 1), 0);
const raycaster = new Raycaster();
const MIN_SCALE = 0.01;

function bedPoint(ndcX: number, ndcY: number, camera: PerspectiveCamera): Vector3 | undefined {
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  const point = new Vector3();
  return raycaster.ray.intersectPlane(BED_PLANE, point) ?? undefined;
}

/** Raycasts only against the given mesh, so a gesture starting elsewhere on the plate never
 * steals ownership from the currently selected object. */
export function hitsSelected(ndcX: number, ndcY: number, camera: PerspectiveCamera, selectedMesh: Mesh): boolean {
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
  return raycaster.intersectObject(selectedMesh, false).length > 0;
}

/**
 * Selected-object gesture ownership, lock state, and bed-drop for the touch transform gizmo.
 * Deliberately app-internal: all math is on `ObjectTransform` (transforms.ts), never the
 * engine's stride-11 encoding, which stays gated behind the task 7.1 contract check.
 */
export function createGizmo(): Gizmo {
  let session: GizmoSession | undefined;
  return {
    get active() { return session !== undefined; },
    get lockedObjectId() { return session?.objectId; },
    begin(object, mode, ndcX, ndcY, camera) {
      // Deep-copied on purpose: `object` may be a live store reference, and every rotateBy/scaleBy
      // call below recomputes from this snapshot (cumulative-since-begin, not a per-call delta) —
      // a live reference would drift as plate.updateTransform mutates the store mid-gesture.
      session = {
        objectId: object.id,
        mode,
        startTransform: {
          position: [...object.transform.position],
          rotation: [...object.transform.rotation],
          scale: [...object.transform.scale],
          mirror: [...object.transform.mirror],
        },
        startPoint: mode === 'move' ? bedPoint(ndcX, ndcY, camera) ?? new Vector3() : new Vector3(),
      };
    },
    moveTo(ndcX, ndcY, camera) {
      if (!session || session.mode !== 'move') return;
      const point = bedPoint(ndcX, ndcY, camera);
      if (!point) return;
      const [x, y, z] = session.startTransform.position;
      const dx = point.x - session.startPoint.x;
      const dy = point.y - session.startPoint.y;
      plate.updateTransform(session.objectId, { ...session.startTransform, position: [x + dx, y + dy, z] });
    },
    rotateBy(radiansSinceBegin) {
      if (!session || session.mode !== 'rotate') return;
      const [rx, ry, rz] = session.startTransform.rotation;
      plate.updateTransform(session.objectId, { ...session.startTransform, rotation: [rx, ry, rz + radiansSinceBegin] });
    },
    scaleBy(factorSinceBegin) {
      if (!session || session.mode !== 'scale') return;
      const multiplier = Math.max(factorSinceBegin, MIN_SCALE);
      const [sx, sy, sz] = session.startTransform.scale;
      plate.updateTransform(session.objectId, { ...session.startTransform, scale: [sx * multiplier, sy * multiplier, sz * multiplier] });
    },
    end() { session = undefined; },
  };
}
