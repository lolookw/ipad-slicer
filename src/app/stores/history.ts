import { createSignal } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { getMeshBuffers, putMeshBuffers, type MeshBuffers } from '../../viewer/geometry-cache';
import { binaries } from './index';
import { plate, type PlateObject, type PlateSnapshot } from './plate';

/**
 * Undo/redo for plate-object edits, as full plate snapshots (not diffs/commands): at this app's
 * scale (a handful to a few dozen objects, capped by the performance tier) a whole-plate snapshot is
 * simple, easy to reason about and cheap — PlateObject is plain serializable data (see its own doc
 * comment in plate.ts), so structuredClone is a fast, safe deep copy with no shared-reference risk.
 *
 * Bounded to MAX_HISTORY_DEPTH entries so a long session can't grow this without limit. 50 is
 * generous: real slicers (Orca/Prusa/Bambu) offer well under that in practice, and each entry here is
 * cheap (a small cloned object array plus reference-only mesh data, never a copy of the actual
 * geometry — see MeshRef below), so the memory cost of keeping the cap this high is negligible.
 */
const MAX_HISTORY_DEPTH = 50;

/**
 * A reference (never a copy) to one removed-or-added object's renderable data, captured at the
 * moment a history entry is recorded — mirrors geometry-cache.ts's duplicateMeshBuffers reasoning:
 * typed arrays are never mutated after import, so sharing the reference is safe and cheap.
 *
 * THE HAZARD THIS EXISTS FOR: PlateObject records (this store) and their mesh data (geometry-cache.ts
 * MeshBuffers, plus the source Blob in stores/index.ts's `binaries`) are two separate, unsynchronized
 * places. ViewerWorkspace.tsx's `sync()` effect reactively calls releaseMesh()/binaries.release() for
 * any id that disappears from plate.state.objects — including a delete that undo later reverses. If
 * undo just reinserted the old PlateObject record without first re-registering its mesh data, the
 * object would come back as an invisible, unpickable ghost (the exact bug duplicateMeshBuffers was
 * added to fix for the duplicate button). restoreMeshes() below re-registers from this reference
 * before the plate record reappears, so that can never happen.
 */
interface MeshRef { buffers: MeshBuffers; blob: Blob | undefined }

interface HistoryEntry { before: PlateSnapshot; after: PlateSnapshot; meshRefs: Map<string, MeshRef> }

const [past, setPast] = createSignal<HistoryEntry[]>([]);
const [future, setFuture] = createSignal<HistoryEntry[]>([]);

/** Reactive guards for disabling the Undo/Redo buttons. */
export const canUndo = () => past().length > 0;
export const canRedo = () => future().length > 0;

function snapshot(): PlateSnapshot {
  // unwrap() first: structuredClone can't walk a Solid store Proxy directly (it throws
  // DataCloneError), so this strips the reactive proxy down to the plain objects/arrays underneath
  // before cloning them.
  return { objects: structuredClone(unwrap(plate.state.objects)), selectedId: plate.state.selectedId };
}

function snapshotsEqual(a: PlateSnapshot, b: PlateSnapshot): boolean {
  return a.selectedId === b.selectedId && JSON.stringify(a.objects) === JSON.stringify(b.objects);
}

/** Records a reference for every object in `objects` that doesn't already have one in `into`. */
function captureMeshRefs(objects: readonly PlateObject[], into: Map<string, MeshRef>): void {
  for (const object of objects) {
    if (into.has(object.id)) continue;
    const buffers = getMeshBuffers(object.id);
    if (!buffers) continue; // nothing registered yet (e.g. import still in flight) — nothing to preserve
    into.set(object.id, { buffers, blob: binaries.getMesh(object.id) });
  }
}

/**
 * Re-registers geometry-cache (and, when known, the source Blob) for every object in `target` that
 * the live caches have since lost — MUST run before the caller hands `target` to
 * plate.restoreSnapshot, so the reactive sync() effect in ViewerWorkspace.tsx never observes a plate
 * record with no mesh behind it (see the hazard note on MeshRef above).
 */
function restoreMeshes(target: PlateSnapshot, meshRefs: ReadonlyMap<string, MeshRef>): void {
  for (const object of target.objects) {
    const ref = meshRefs.get(object.id);
    if (!ref) continue;
    if (!getMeshBuffers(object.id)) putMeshBuffers(object.id, ref.buffers);
    if (ref.blob && !binaries.getMesh(object.id)) binaries.putMesh(object.id, ref.blob);
  }
}

function pushEntry(entry: HistoryEntry): void {
  if (snapshotsEqual(entry.before, entry.after)) return; // no real data change (e.g. a cancelled drag, or a no-op action)
  setFuture([]); // a new action invalidates whatever redo history existed
  setPast(stack => {
    const next = [...stack, entry];
    return next.length > MAX_HISTORY_DEPTH ? next.slice(next.length - MAX_HISTORY_DEPTH) : next;
  });
}

export interface HistoryTransaction {
  /** Captures the after-state and pushes one entry (skipped automatically if nothing actually changed). */
  commit(): void;
  /** Ends the transaction without recording anything — for a gesture that reverted itself (e.g. gizmo.cancel()). */
  discard(): void;
}

/**
 * Brackets a multi-step interaction (the only real-world case here is a live gizmo drag: many
 * `plate.updateTransform` calls, one per pointer-move frame) into exactly one history entry. Capture
 * "before" state eagerly, at the start of the gesture — not at commit time — so an object that gets
 * removed partway through (not applicable to a drag today, but keeps this correct for any future use)
 * can never lose its mesh reference before this transaction captured it.
 */
export function beginTransaction(): HistoryTransaction {
  const before = snapshot();
  const meshRefs = new Map<string, MeshRef>();
  captureMeshRefs(plate.state.objects, meshRefs);
  let settled = false;
  return {
    commit(): void {
      if (settled) return;
      settled = true;
      const after = snapshot();
      captureMeshRefs(plate.state.objects, meshRefs); // covers anything newly added during the transaction
      pushEntry({ before, after, meshRefs });
    },
    discard(): void { settled = true; },
  };
}

/** One synchronous plate mutation = one history entry (rotate90, duplicate, delete, rename, ...). */
export function record<T>(mutate: () => T): T {
  const tx = beginTransaction();
  const result = mutate();
  tx.commit();
  return result;
}

/** Same as `record`, for an action whose plate mutation only lands after an await (prepareCurrentPlate). */
export async function recordAsync<T>(mutate: () => Promise<T>): Promise<T> {
  const tx = beginTransaction();
  try {
    return await mutate();
  } finally {
    tx.commit();
  }
}

export function undo(): void {
  const stack = past();
  const entry = stack.at(-1);
  if (!entry) return;
  restoreMeshes(entry.before, entry.meshRefs);
  plate.restoreSnapshot(entry.before);
  setPast(stack.slice(0, -1));
  setFuture(items => [...items, entry]);
}

export function redo(): void {
  const stack = future();
  const entry = stack.at(-1);
  if (!entry) return;
  restoreMeshes(entry.after, entry.meshRefs);
  plate.restoreSnapshot(entry.after);
  setFuture(stack.slice(0, -1));
  setPast(items => [...items, entry]);
}

/** Test/utility hook: drops all recorded history without touching the live plate. */
export function clear(): void { setPast([]); setFuture([]); }
