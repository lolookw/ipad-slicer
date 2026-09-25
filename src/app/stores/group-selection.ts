import { createMemo, createSignal } from 'solid-js';
import { plate } from './plate';

/**
 * Group ("multi-object") selection: a superset of the plate's single PRIMARY selection
 * (plate.state.selectedId), used only for group actions (move/duplicate/delete) and the 3D
 * highlight of every selected mesh. It deliberately does NOT replace selectedId anywhere: the
 * gizmo, TransformFields and the Object-tools toolbar keep targeting plate.state.selectedId
 * exactly as before this feature (see plate.ts's own doc comment on PlateState). Kept as its own
 * module rather than folded into plate.ts/history.ts: this is ephemeral UI selection state, not
 * plate data, so it is never part of a PlateSnapshot and is untouched by undo/redo — exactly like
 * the mode toolbar (Select/Move/Rotate) or camera state, neither of which is undoable either.
 */
const [groupSelectModeSignal, setGroupSelectModeSignal] = createSignal(false);
const [rawGroupSelectedIds, setRawGroupSelectedIds] = createSignal<ReadonlySet<string>>(new Set<string>());

export const groupSelectMode = groupSelectModeSignal;

/**
 * The effective group selection: the manually built set while "Select multiple" is on, or just the
 * current primary selection while it is off. Every call site that reads this (group actions, the
 * 3D highlight) can use it unconditionally, with no separate "is group mode even on" branch, and it
 * can never go stale relative to plate.state.selectedId while the mode is off (a plain plate.select
 * call anywhere else in the app, e.g. a normal single tap, is instantly reflected here).
 */
export const groupSelectedIds = createMemo<ReadonlySet<string>>(() => (
  groupSelectModeSignal() ? rawGroupSelectedIds() : new Set<string>(plate.state.selectedId ? [plate.state.selectedId] : [])
));

/** Resets the raw group set down to just the current primary selection (or empty, if none). */
export function clearGroupSelection(): void {
  setRawGroupSelectedIds(new Set<string>(plate.state.selectedId ? [plate.state.selectedId] : []));
}

/** Turns "Select multiple" on/off. Either direction starts the group fresh, at just the primary. */
export function setGroupSelectMode(next: boolean): void {
  setGroupSelectModeSignal(next);
  clearGroupSelection();
}

/**
 * Adds/removes `id` from the group selection, keeping plate.state.selectedId (the primary) as the
 * most-recently-toggled member: toggling a new id on makes it primary; toggling the current primary
 * off falls back to the next-most-recently-toggled surviving member (Set iteration order is
 * insertion order in JS), or undefined once the group is empty.
 */
export function toggleGroupSelection(id: string): void {
  const next = new Set(rawGroupSelectedIds());
  if (next.has(id)) {
    next.delete(id);
    setRawGroupSelectedIds(next);
    if (plate.state.selectedId === id) plate.select([...next].at(-1));
  } else {
    next.add(id);
    setRawGroupSelectedIds(next);
    plate.select(id); // the newly toggled-on id becomes primary
  }
}

/**
 * Replaces the group selection outright (e.g. after a group duplicate, where the freshly created
 * copies become the new group) — does not itself touch plate.state.selectedId.
 */
export function setGroupSelection(ids: Iterable<string>): void {
  setRawGroupSelectedIds(new Set(ids));
}

/**
 * Selects every object currently on the plate. Groundwork for a future "select all" keyboard/gesture
 * shortcut (a separate later task, per the product ask) — not wired to any UI control yet, but
 * callable and fully functional on its own.
 */
export function selectAll(): void {
  const objects = plate.state.objects;
  if (!objects.length) { setRawGroupSelectedIds(new Set<string>()); return; }
  setRawGroupSelectedIds(new Set(objects.map(object => object.id)));
  if (!plate.state.selectedId || !objects.some(object => object.id === plate.state.selectedId)) plate.select(objects.at(-1)!.id);
}
