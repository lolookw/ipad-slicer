import type { Ray, Vector3 } from 'three';
import { AXIS_INDEX, axisVector, formatMoveReadout, formatRotateReadout, keepAbovePlate, type AxisName } from './axis';
import {
  MOVE_SNAP_MM, ROTATE_SNAP_RAD, closestParamOnAxis, intersectHorizontalPlane, objectCenter, restsOnPlate, ringVector,
  rotateAboutWorldAxis, settleAfterRotate, signedAngleAbout, snapValue, unwrapDelta,
} from './drag-math';
import { plate, type PlateObject } from '../app/stores/plate';
import { resolvedSettings } from '../app/stores/configuration';
import { beginTransaction, record, type HistoryTransaction } from '../app/stores/history';
import { engineClient } from '../engine/client';
import { encodeEngineTransforms, fromEngineTransform, toEngineTransform, type ObjectTransform } from './transforms';

/** What a press grabbed: the object body (horizontal drag), a move arrow, or a rotation ring. */
export type DragTarget =
  | { kind: 'body'; hitPoint: Vector3 }
  | { kind: 'arrow'; axis: AxisName }
  | { kind: 'ring'; axis: AxisName };

interface Session {
  objectId: string;
  target: DragTarget;
  bounds: PlateObject['bounds'];
  startTransform: ObjectTransform;
  wasOnPlate: boolean;
  /** Body drag: the point under the pointer on the horizontal plane through the grab depth. */
  startPoint?: Vector3;
  /** Arrow/ring drag anchor: the object's world center when the press began. */
  center: Vector3;
  /** Arrow: axis parameter under the pointer at press. Ring: start vector in the ring plane. */
  startParam?: number;
  startVector?: Vector3;
  /**
   * Ring drag only. `signedAngleAbout` returns an ABSOLUTE angle from `startVector`, wrapped to (-PI, PI],
   * recomputed fresh every frame. `lastRingAngle` is that raw wrapped reading from the previous frame, and
   * `accumulatedRingAngle` is the continuous running total (never wrapped) actually applied to the
   * transform, so a drag that sweeps past 180 degrees keeps turning instead of snapping backward.
   */
  lastRingAngle?: number;
  accumulatedRingAngle?: number;
  /**
   * Group move only (body drag with 2+ objects in the group selection): every OTHER selected
   * object's transform as it was at `begin()`, so `update()` can apply the identical position delta
   * to all of them, not just the primary — see createGizmo's `groupIds` param.
   */
  groupStart?: Map<string, ObjectTransform>;
}

export interface Gizmo {
  readonly active: boolean;
  readonly lockedObjectId: string | undefined;
  /** Snapshots the object and the grab; nothing changes until `update`. */
  begin(object: PlateObject, target: DragTarget, ray: Ray): void;
  /** Absolute pointer ray each call (never incremental) so the object cannot drift from the finger. */
  update(ray: Ray, snap: boolean): void;
  /** Restores the transform the object had at `begin` (a second finger turned the gesture into a camera move). */
  cancel(): void;
  end(): void;
}

/** Prepares a complete plate snapshot and commits only after a valid full result is received. */
export async function prepareCurrentPlate(operation: 1 | 2 | 3): Promise<void> {
  const settings = resolvedSettings();
  if (!settings) throw new Error('prepare-configuration-missing');
  const snapshot = plate.state.objects.map(object => ({ id: object.id, transform: object.transform }));
  if (!snapshot.length) throw new Error('prepare-model-missing');
  const messages = snapshot.map(object => ({ meshId: object.id,
    transform: encodeEngineTransforms([toEngineTransform(object.transform, operation === 2)]), extruderId: 1 }));
  const prepared = await engineClient.prepare(JSON.stringify(settings), messages, operation);
  const next = new Map(snapshot.map((object, index) => [object.id, fromEngineTransform(prepared[index]!, object.transform)]));
  // One history entry per prepare result (Lay flat or Orient-and-arrange), however many objects it touches.
  record(() => plate.applyPreparedTransforms(next));
}

const copy = (transform: ObjectTransform): ObjectTransform => ({
  position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale], mirror: [...transform.mirror],
});

/**
 * Drag session for the selected object. Deliberately app-internal: all math is on `ObjectTransform`
 * (transforms.ts), never the engine's stride-11 encoding. Every update recomputes from the snapshot
 * taken at `begin`, so a live store reference can never drift mid-gesture.
 */
export function createGizmo(
  onReadout?: (value: string | undefined) => void,
  /** Group move: the current group selection, so a body drag on the primary can carry the rest of
   * the group along by the identical delta. Optional and only consulted for `kind: 'body'` — arrow
   * and ring drags stay single-object, exactly as before this feature (see the design note on why
   * only the primary ever drives the gizmo). */
  groupIds?: () => ReadonlySet<string>,
): Gizmo {
  let session: Session | undefined;
  // Brackets the whole drag (begin..end/cancel) into ONE history entry, never one per pointer-move
  // frame: commit() below fires on every update() call, but the transaction only captures "before" at
  // begin() and "after" once, at end() — cancel() discards without recording (the transform is already
  // back to its pre-drag value by then, via commit(session.startTransform), so there is nothing to undo).
  let historyTx: HistoryTransaction | undefined;

  const commit = (transform: ObjectTransform) => {
    if (session) plate.updateTransform(session.objectId, transform, { dropToBed: false });
  };

  return {
    get active() { return session !== undefined; },
    get lockedObjectId() { return session?.objectId; },
    begin(object, target, ray) {
      historyTx = beginTransaction();
      const startTransform = copy(object.transform);
      const center = objectCenter(object.bounds, startTransform);
      session = { objectId: object.id, target, bounds: object.bounds, startTransform, center, wasOnPlate: restsOnPlate(object.bounds, startTransform) };
      if (target.kind === 'body') {
        session.startPoint = intersectHorizontalPlane(ray, target.hitPoint.z) ?? target.hitPoint.clone();
        const group = groupIds?.();
        if (group && group.size > 1) {
          const starts = new Map<string, ObjectTransform>();
          for (const id of group) {
            if (id === object.id) continue;
            const other = plate.state.objects.find(candidate => candidate.id === id);
            if (other) starts.set(id, copy(other.transform));
          }
          if (starts.size) session.groupStart = starts;
        }
      }
      else if (target.kind === 'arrow') session.startParam = closestParamOnAxis(ray, center, axisVector(target.axis));
      else {
        session.startVector = ringVector(ray, center, axisVector(target.axis));
        session.lastRingAngle = 0;
        session.accumulatedRingAngle = 0;
      }
    },
    update(ray, snap) {
      if (!session) return;
      const { target, startTransform, bounds } = session;
      if (target.kind === 'body') {
        const point = intersectHorizontalPlane(ray, target.hitPoint.z);
        if (!point || !session.startPoint) return;
        let dx = point.x - session.startPoint.x;
        let dy = point.y - session.startPoint.y;
        if (snap) { dx = snapValue(dx, MOVE_SNAP_MM); dy = snapValue(dy, MOVE_SNAP_MM); }
        commit({ ...startTransform, position: [startTransform.position[0] + dx, startTransform.position[1] + dy, startTransform.position[2]] });
        // Group move: every other currently-selected object rides along by the identical (dx, dy),
        // committed every frame just like the primary — beginTransaction/commit() at end() still
        // brackets the whole gesture into exactly one history entry, since it diffs the whole plate.
        if (session.groupStart) for (const [id, groupTransform] of session.groupStart) {
          plate.updateTransform(id, { ...groupTransform,
            position: [groupTransform.position[0] + dx, groupTransform.position[1] + dy, groupTransform.position[2]] }, { dropToBed: false });
        }
        onReadout?.(`${formatMoveReadout('x', dx)}  ${formatMoveReadout('y', dy)}`);
      } else if (target.kind === 'arrow') {
        const t = closestParamOnAxis(ray, session.center, axisVector(target.axis));
        if (t === undefined) return;
        session.startParam ??= t;
        let delta = t - session.startParam;
        if (snap) delta = snapValue(delta, MOVE_SNAP_MM);
        const index = AXIS_INDEX[target.axis];
        const position = [...startTransform.position] as ObjectTransform['position'];
        position[index] += delta;
        const next = { ...startTransform, position };
        const settled = target.axis === 'z' ? keepAbovePlate(next, bounds) : next;
        commit(settled);
        onReadout?.(formatMoveReadout(target.axis, settled.position[index] - startTransform.position[index]));
      } else {
        const axis = axisVector(target.axis);
        const now = ringVector(ray, session.center, axis);
        if (!now) return; // Ray grazes the ring plane: freeze at the last committed angle rather than guess.
        if (!session.startVector) { session.startVector = now; session.lastRingAngle = 0; session.accumulatedRingAngle = 0; }
        const raw = signedAngleAbout(axis, session.startVector, now);
        session.accumulatedRingAngle = (session.accumulatedRingAngle ?? 0) + unwrapDelta(session.lastRingAngle ?? 0, raw);
        session.lastRingAngle = raw;
        let angle = session.accumulatedRingAngle;
        if (snap) angle = snapValue(angle, ROTATE_SNAP_RAD);
        commit(settleAfterRotate(rotateAboutWorldAxis(startTransform, bounds, target.axis, angle), bounds, session.wasOnPlate));
        onReadout?.(formatRotateReadout(target.axis, angle));
      }
    },
    cancel() {
      if (session) {
        commit(session.startTransform);
        if (session.groupStart) for (const [id, groupTransform] of session.groupStart) plate.updateTransform(id, groupTransform, { dropToBed: false });
      }
      session = undefined;
      historyTx?.discard();
      historyTx = undefined;
      onReadout?.(undefined);
    },
    end() {
      session = undefined;
      historyTx?.commit();
      historyTx = undefined;
      onReadout?.(undefined);
    },
  };
}
