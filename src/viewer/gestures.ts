import type { Mesh, PerspectiveCamera } from 'three';
import type { PlateObject } from '../app/stores/plate';
import type { Gizmo } from './gizmo';
import type { ViewerCameraControls } from './camera';

export const TAP_MAX_DISTANCE_PX = 10;
export const TAP_MAX_DURATION_MS = 250;
export const DOUBLE_TAP_MAX_DELAY_MS = 300;

interface Point { x: number; y: number; time: number }
export type TransformGestureMode = 'move' | 'rotate';

interface TransformCandidate {
  object: PlateObject;
  start: Point;
}

interface ActiveTransform {
  pointerId: number;
  mode: TransformGestureMode;
  startX: number;
}

export interface GestureOptions {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls: ViewerCameraControls;
  gizmo: Gizmo;
  selectedMesh: () => Mesh | undefined;
  selectedObject: () => PlateObject | undefined;
  transformMode: () => TransformGestureMode;
  meshAt: (xNdc: number, yNdc: number) => Mesh | undefined;
  onSelect: (id: string | undefined) => void;
  onFit: () => void;
}

export interface ViewerGestures { dispose(): void }

export function pointerNdc(canvas: HTMLCanvasElement, clientX: number, clientY: number): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [(clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2];
}

/** Capture-phase ownership gate. A selected-object press stays camera-owned until it exceeds
 * the tap threshold; only then does the transform gesture take exclusive ownership. */
export function createViewerGestures(options: GestureOptions): ViewerGestures {
  const starts = new Map<number, Point>();
  const candidates = new Map<number, TransformCandidate>();
  const owned = new Set<number>();
  let activeTransform: ActiveTransform | undefined;
  let lastTap: Point | undefined;

  const down = (event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    starts.set(event.pointerId, point);
    const [x, y] = pointerNdc(options.canvas, event.clientX, event.clientY);
    const selected = options.selectedMesh();
    const object = options.selectedObject();
    if (options.gizmo.active) {
      owned.add(event.pointerId);
      options.controls.setEnabled(false);
      event.stopImmediatePropagation();
    } else if (selected && object && selected.name === object.id && options.meshAt(x, y) === selected) {
      candidates.set(event.pointerId, { object, start: point });
    }
  };
  const move = (event: PointerEvent) => {
    if (activeTransform?.pointerId === event.pointerId) {
      const [x, y] = pointerNdc(options.canvas, event.clientX, event.clientY);
      if (activeTransform.mode === 'move') options.gizmo.moveTo(x, y, options.camera);
      else {
        const width = Math.max(options.canvas.getBoundingClientRect().width, 1);
        options.gizmo.rotateBy((event.clientX - activeTransform.startX) / width * Math.PI * 2);
      }
      event.stopImmediatePropagation();
      return;
    }
    if (owned.has(event.pointerId) || options.gizmo.active) {
      event.stopImmediatePropagation();
      return;
    }
    const candidate = candidates.get(event.pointerId);
    if (!candidate || Math.hypot(event.clientX - candidate.start.x, event.clientY - candidate.start.y) <= TAP_MAX_DISTANCE_PX) return;
    const [x, y] = pointerNdc(options.canvas, event.clientX, event.clientY);
    const mode = options.transformMode();
    options.gizmo.begin(candidate.object, mode, x, y, options.camera);
    activeTransform = { pointerId: event.pointerId, mode, startX: event.clientX };
    candidates.delete(event.pointerId);
    owned.add(event.pointerId);
    options.controls.setEnabled(false);
    event.stopImmediatePropagation();
  };
  const up = (event: PointerEvent) => {
    const start = starts.get(event.pointerId);
    starts.delete(event.pointerId);
    candidates.delete(event.pointerId);
    if (owned.delete(event.pointerId)) {
      if (activeTransform?.pointerId === event.pointerId) {
        options.gizmo.end();
        activeTransform = undefined;
      }
      if (owned.size === 0) options.controls.setEnabled(true);
      event.stopImmediatePropagation();
      return;
    }
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance > TAP_MAX_DISTANCE_PX || event.timeStamp - start.time > TAP_MAX_DURATION_MS) return;
    const tap = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (lastTap && tap.time - lastTap.time <= DOUBLE_TAP_MAX_DELAY_MS && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) <= TAP_MAX_DISTANCE_PX) {
      lastTap = undefined;
      options.onFit();
      return;
    }
    lastTap = tap;
    const [x, y] = pointerNdc(options.canvas, event.clientX, event.clientY);
    options.onSelect(options.meshAt(x, y)?.name || undefined);
  };
  const cancel = (event: PointerEvent) => {
    const wasOwned = owned.has(event.pointerId) || activeTransform?.pointerId === event.pointerId;
    starts.delete(event.pointerId);
    candidates.delete(event.pointerId);
    owned.delete(event.pointerId);
    if (activeTransform?.pointerId === event.pointerId) {
      options.gizmo.end();
      activeTransform = undefined;
    }
    if (owned.size === 0) options.controls.setEnabled(true);
    if (wasOwned) event.stopImmediatePropagation();
  };

  options.canvas.addEventListener('pointerdown', down, true);
  options.canvas.addEventListener('pointermove', move, true);
  options.canvas.addEventListener('pointerup', up, true);
  options.canvas.addEventListener('pointercancel', cancel, true);
  options.canvas.addEventListener('contextmenu', event => event.preventDefault());
  return { dispose() {
    options.canvas.removeEventListener('pointerdown', down, true);
    options.canvas.removeEventListener('pointermove', move, true);
    options.canvas.removeEventListener('pointerup', up, true);
    options.canvas.removeEventListener('pointercancel', cancel, true);
    starts.clear(); candidates.clear(); owned.clear();
    if (options.gizmo.active) options.gizmo.end();
    activeTransform = undefined;
    options.controls.setEnabled(true);
  } };
}
