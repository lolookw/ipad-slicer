import type { Mesh, PerspectiveCamera } from 'three';
import type { Gizmo } from './gizmo';
import type { ViewerCameraControls } from './camera';

export const TAP_MAX_DISTANCE_PX = 10;
export const TAP_MAX_DURATION_MS = 250;
export const DOUBLE_TAP_MAX_DELAY_MS = 300;

interface Point { x: number; y: number; time: number }

export interface GestureOptions {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls: ViewerCameraControls;
  gizmo: Gizmo;
  selectedMesh: () => Mesh | undefined;
  meshAt: (xNdc: number, yNdc: number) => Mesh | undefined;
  onSelect: (id: string | undefined) => void;
  onFit: () => void;
}

export interface ViewerGestures { dispose(): void }

export function pointerNdc(canvas: HTMLCanvasElement, clientX: number, clientY: number): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [(clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2];
}

/** Capture-phase ownership gate: a pointer beginning on the selected object never reaches camera-controls. */
export function createViewerGestures(options: GestureOptions): ViewerGestures {
  const starts = new Map<number, Point>();
  const owned = new Set<number>();
  let lastTap: Point | undefined;

  const down = (event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    starts.set(event.pointerId, point);
    const [x, y] = pointerNdc(options.canvas, event.clientX, event.clientY);
    const selected = options.selectedMesh();
    if (options.gizmo.active || (selected && options.meshAt(x, y) === selected)) {
      owned.add(event.pointerId);
      options.controls.setEnabled(false);
      event.stopImmediatePropagation();
    }
  };
  const move = (event: PointerEvent) => {
    if (owned.has(event.pointerId) || options.gizmo.active) event.stopImmediatePropagation();
  };
  const up = (event: PointerEvent) => {
    const start = starts.get(event.pointerId);
    starts.delete(event.pointerId);
    if (owned.delete(event.pointerId)) {
      if (owned.size === 0 && !options.gizmo.active) options.controls.setEnabled(true);
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
    starts.delete(event.pointerId);
    owned.delete(event.pointerId);
    if (owned.size === 0 && !options.gizmo.active) options.controls.setEnabled(true);
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
    starts.clear(); owned.clear(); options.controls.setEnabled(true);
  } };
}
