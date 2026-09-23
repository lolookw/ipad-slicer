import type { Mesh, PerspectiveCamera, Vector3 } from 'three';
import type { PlateObject } from '../app/stores/plate';
import type { ViewerCameraControls } from './camera';
import { classifyWheel, isSnapping, rayFromNdc } from './drag-math';
import type { Gizmo } from './gizmo';
import type { GizmoHandle, GizmoView } from './gizmo-handles';

/** Click-vs-drag threshold shared with OrcaSlicer's 5 px. */
export const TAP_MAX_DISTANCE_PX = 5;
export const TAP_MAX_DURATION_MS = 250;
export const DOUBLE_TAP_MAX_DELAY_MS = 300;
export const DOUBLE_TAP_MAX_DISTANCE_PX = 24;
export const TOUCH_PICK_RADIUS_PX = 12;
export const MOUSE_PICK_RADIUS_PX = 3;

interface Point { x: number; y: number; time: number }

type Primary =
  /** `moved` latches once the pointer ever crosses the tap threshold, so a drag that wanders out and
   * back within the threshold before release still counts as a drag, not a tap (only the release-time
   * displacement was checked before, which missed exactly that out-and-back case). */
  | { kind: 'camera'; pointerId: number; start: Point; moved: boolean }
  | { kind: 'gizmo' | 'body'; pointerId: number; start: Point; dragging: boolean };

export interface GestureOptions {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls: ViewerCameraControls;
  gizmo: Gizmo;
  handles: GizmoView;
  selectedId: () => string | undefined;
  objectById: (id: string) => PlateObject | undefined;
  pickAt: (xNdc: number, yNdc: number, radiusPx: number) => { mesh: Mesh; point: Vector3 } | undefined;
  snapEnabled: () => boolean;
  onSelect: (id: string | undefined) => void;
  onFit: () => void;
  /** Called when the gizmo hover/pressed look changed so the next frame is drawn. */
  onVisualChange?: () => void;
  /** A transform gesture finished or was cancelled; the pivot follows the object's new center. */
  onTransformEnd?: () => void;
}

export interface ViewerGestures { dispose(): void }

export function pointerNdc(canvas: HTMLCanvasElement, clientX: number, clientY: number): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [(clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2];
}

/**
 * Capture-phase pointer ownership, in priority order: gizmo handle, then any object, then the camera.
 *
 * - One pointer (touch, pen or left mouse) on a handle drags it; on an object it selects immediately and,
 *   once past the 5 px threshold, moves the object on the horizontal plane through the grab point; on empty
 *   space camera-controls orbits.
 * - A second touch always belongs to the camera: it reverts any one-finger transform and stays camera-owned
 *   until every finger is up (pinch/pan are camera-controls; twist is added here).
 * - camera-controls still sees every pointerdown so two-finger gestures work; the one-pointer camera action
 *   is switched off while a transform owns the pointer instead of swallowing the event.
 */
export function createViewerGestures(options: GestureOptions): ViewerGestures {
  const { canvas } = options;
  const touches = new Map<number, { x: number; y: number }>();
  let primary: Primary | undefined;
  let multiTouch = false;
  let twistAngle: number | undefined;
  let lastEmptyTap: Point | undefined;
  let pendingDeselect: ReturnType<typeof setTimeout> | undefined;
  let hover: GizmoHandle | undefined;

  const size = () => { const rect = canvas.getBoundingClientRect(); return { rect, width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) }; };
  const rayAt = (event: PointerEvent) => { const [x, y] = pointerNdc(canvas, event.clientX, event.clientY); return rayFromNdc(options.camera, x, y); };
  const cancelPendingDeselect = () => { if (pendingDeselect !== undefined) { clearTimeout(pendingDeselect); pendingDeselect = undefined; } };
  const capture = (id: number) => { try { canvas.setPointerCapture(id); } catch { /* synthetic or already-released pointer */ } };
  const release = (id: number) => { try { canvas.releasePointerCapture(id); } catch { /* not captured */ } };
  const transformOwned = () => primary !== undefined && primary.kind !== 'camera';
  const syncCamera = () => options.controls.setPrimaryEnabled(!multiTouch && !transformOwned());
  const setPressed = (handle: GizmoHandle | undefined) => { if (options.handles.setPressed(handle)) options.onVisualChange?.(); };

  const abandonTransform = (revert: boolean) => {
    if (!primary || primary.kind === 'camera') return;
    release(primary.pointerId);
    if (revert) options.gizmo.cancel(); else options.gizmo.end();
    setPressed(undefined);
  };

  const enterMultiTouch = () => {
    multiTouch = true;
    abandonTransform(true);
    primary = undefined;
    const [a, b] = [...touches.values()];
    twistAngle = a && b ? Math.atan2(b.y - a.y, b.x - a.x) : undefined;
    syncCamera();
  };

  const down = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) { enterMultiTouch(); return; }
    } else if (event.button !== 0) return; // right/middle mouse: camera pan
    if (multiTouch) return;

    const start: Point = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    const [x, y] = pointerNdc(canvas, event.clientX, event.clientY);
    const { rect, width, height } = size();
    const selected = options.selectedId();
    const object = selected ? options.objectById(selected) : undefined;
    hover = undefined;

    const handle = object ? options.handles.hitTest(event.clientX - rect.left, event.clientY - rect.top, options.camera, width, height) : undefined;
    if (object && handle) {
      // A deselect scheduled by a prior empty tap (see emptyTap()) must not fire mid-drag: it would hide
      // the gizmo and clear selection while this drag session keeps transforming the (now hidden) object.
      cancelPendingDeselect();
      options.gizmo.begin(object, { kind: handle.kind, axis: handle.axis }, rayAt(event));
      primary = { kind: 'gizmo', pointerId: event.pointerId, start, dragging: true };
      setPressed(handle);
      capture(event.pointerId);
      syncCamera();
      return;
    }

    const hit = options.pickAt(x, y, event.pointerType === 'mouse' ? MOUSE_PICK_RADIUS_PX : TOUCH_PICK_RADIUS_PX);
    const target = hit ? options.objectById(hit.mesh.name) : undefined;
    if (hit && target) {
      cancelPendingDeselect();
      lastEmptyTap = undefined;
      options.onSelect(target.id);
      options.gizmo.begin(target, { kind: 'body', hitPoint: hit.point }, rayAt(event));
      primary = { kind: 'body', pointerId: event.pointerId, start, dragging: false };
      capture(event.pointerId);
      syncCamera();
      return;
    }

    primary = { kind: 'camera', pointerId: event.pointerId, start, moved: false };
    syncCamera();
  };

  const move = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      const known = touches.get(event.pointerId);
      if (known) { known.x = event.clientX; known.y = event.clientY; }
      if (touches.size >= 2) {
        const [a, b] = [...touches.values()];
        const angle = Math.atan2(b!.y - a!.y, b!.x - a!.x);
        if (twistAngle !== undefined) {
          let delta = angle - twistAngle;
          if (delta > Math.PI) delta -= Math.PI * 2; else if (delta < -Math.PI) delta += Math.PI * 2;
          options.controls.twist(delta);
        }
        twistAngle = angle;
        return;
      }
    }
    if (primary && primary.pointerId === event.pointerId) {
      if (primary.kind === 'camera') {
        if (!primary.moved && Math.hypot(event.clientX - primary.start.x, event.clientY - primary.start.y) > TAP_MAX_DISTANCE_PX) primary.moved = true;
        return;
      }
      if (primary.kind === 'body' && !primary.dragging) {
        if (Math.hypot(event.clientX - primary.start.x, event.clientY - primary.start.y) <= TAP_MAX_DISTANCE_PX) return;
        primary.dragging = true;
      }
      options.gizmo.update(rayAt(event), isSnapping(options.snapEnabled(), event.shiftKey));
      event.stopImmediatePropagation();
      return;
    }
    if (event.pointerType !== 'touch' && !primary && options.selectedId()) {
      const { rect, width, height } = size();
      const next = options.handles.hitTest(event.clientX - rect.left, event.clientY - rect.top, options.camera, width, height);
      if (options.handles.setHover(next)) options.onVisualChange?.();
      if (next?.axis !== hover?.axis || next?.kind !== hover?.kind) canvas.style.cursor = next ? 'grab' : '';
      hover = next;
    }
  };

  const emptyTap = (event: PointerEvent) => {
    const tap: Point = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (lastEmptyTap && tap.time - lastEmptyTap.time <= DOUBLE_TAP_MAX_DELAY_MS
      && Math.hypot(tap.x - lastEmptyTap.x, tap.y - lastEmptyTap.y) <= DOUBLE_TAP_MAX_DISTANCE_PX) {
      lastEmptyTap = undefined;
      cancelPendingDeselect();
      options.onFit();
      return;
    }
    lastEmptyTap = tap;
    // Deselect is deferred so a double-tap fit does not first flicker the selection away.
    if (options.selectedId()) {
      cancelPendingDeselect();
      pendingDeselect = setTimeout(() => { pendingDeselect = undefined; options.onSelect(undefined); }, DOUBLE_TAP_MAX_DELAY_MS);
    }
  };

  const finish = (event: PointerEvent, cancelled: boolean) => {
    touches.delete(event.pointerId);
    if (primary && primary.pointerId === event.pointerId) {
      const finished = primary;
      if (finished.kind === 'camera') {
        primary = undefined;
        if (!cancelled && !multiTouch && !finished.moved && event.timeStamp - finished.start.time <= TAP_MAX_DURATION_MS) emptyTap(event);
      } else {
        abandonTransform(cancelled);
        primary = undefined;
        options.onTransformEnd?.();
      }
    }
    if (touches.size === 0) { multiTouch = false; twistAngle = undefined; } else twistAngle = undefined;
    syncCamera();
  };
  const up = (event: PointerEvent) => finish(event, false);
  const cancel = (event: PointerEvent) => finish(event, true);

  const wheel = (event: WheelEvent) => {
    if (classifyWheel(event) !== 'pan') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.controls.panScreen(-event.deltaX, -event.deltaY, size().height);
  };
  const contextMenu = (event: Event) => event.preventDefault();

  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', cancel, true);
  canvas.addEventListener('wheel', wheel, { capture: true, passive: false });
  canvas.addEventListener('contextmenu', contextMenu);
  return { dispose() {
    canvas.removeEventListener('pointerdown', down, true);
    canvas.removeEventListener('pointermove', move, true);
    canvas.removeEventListener('pointerup', up, true);
    canvas.removeEventListener('pointercancel', cancel, true);
    canvas.removeEventListener('wheel', wheel, true);
    canvas.removeEventListener('contextmenu', contextMenu);
    cancelPendingDeselect();
    if (options.gizmo.active) options.gizmo.end();
    touches.clear(); primary = undefined; multiTouch = false;
    options.controls.setPrimaryEnabled(true);
  } };
}
