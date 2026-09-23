import { PerspectiveCamera, Vector3, type Mesh } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plate } from '../app/stores/plate';
import type { ViewerCameraControls } from './camera';
import { createGizmo } from './gizmo';
import type { GizmoHandle, GizmoView } from './gizmo-handles';
import {
  createViewerGestures, pointerNdc, DOUBLE_TAP_MAX_DELAY_MS, TAP_MAX_DISTANCE_PX, TAP_MAX_DURATION_MS, type GestureOptions, type ViewerGestures,
} from './gestures';

function pointer(type: string, init: PointerEventInit & { timeStamp?: number }) {
  const { timeStamp, ...eventInit } = init;
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50, ...eventInit });
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
}

function topCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -1, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function seedObject() {
  plate.clear();
  plate.addObject({ id: 'one', name: 'one.stl', triangleCount: 12, bounds: { min: [-5, -5, 0], max: [5, 5, 10] },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false] } });
  return plate.state.objects[0]!;
}
const transformJson = () => JSON.stringify(plate.state.objects[0]!.transform);

function fakeControls() {
  return { enabled: true, setPrimaryEnabled: vi.fn(), fit: vi.fn(), setPivot: vi.fn(), panScreen: vi.fn(), twist: vi.fn(), update: vi.fn(), dispose: vi.fn() } satisfies ViewerCameraControls;
}
function fakeHandles(hit?: GizmoHandle): GizmoView {
  return { hitTest: vi.fn(() => hit), setHover: vi.fn(() => false), setPressed: vi.fn(() => false) } as unknown as GizmoView;
}

/** Objects occupy screen x < 60; everything else is empty plate. */
const mesh = { name: 'one' } as Mesh;
const pickAt: GestureOptions['pickAt'] = xNdc => (xNdc < 0.2 ? { mesh, point: new Vector3(0, 0, 10) } : undefined);

let canvas: HTMLCanvasElement;
let gestures: ViewerGestures | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  canvas.setPointerCapture = vi.fn(); canvas.releasePointerCapture = vi.fn();
});
afterEach(() => { gestures?.dispose(); gestures = undefined; vi.useRealTimers(); plate.clear(); });

function setup(overrides: Partial<GestureOptions> = {}) {
  seedObject();
  const controls = fakeControls();
  const onSelect = vi.fn((id: string | undefined) => plate.select(id));
  const onFit = vi.fn();
  const onTransformEnd = vi.fn();
  const gizmo = createGizmo();
  gestures = createViewerGestures({
    canvas, camera: topCamera(), controls, gizmo, handles: fakeHandles(),
    selectedId: () => plate.state.selectedId, objectById: id => plate.state.objects.find(object => object.id === id),
    pickAt, snapEnabled: () => true, onSelect, onFit, onTransformEnd, ...overrides,
  });
  return { controls, onSelect, onFit, onTransformEnd, gizmo };
}

const touch = (type: string, id: number, x: number, y: number, timeStamp = 0) => pointer(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, timeStamp });

describe('viewer gestures', () => {
  it('converts canvas coordinates to normalized device coordinates numerically', () => {
    const local = document.createElement('canvas');
    vi.spyOn(local, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    expect(pointerNdc(local, 110, 70)).toEqual([0, 0]);
    expect(pointerNdc(local, 10, 20)).toEqual([-1, 1]);
    expect(TAP_MAX_DISTANCE_PX).toBe(5);
    expect(TAP_MAX_DURATION_MS).toBe(250);
  });

  it('selects an unselected object the moment a pointer lands on it and takes the pointer from the camera', () => {
    const { controls, onSelect } = setup();
    plate.select(undefined);
    onSelect.mockClear();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, clientY: 50, timeStamp: 1 }));
    expect(onSelect).toHaveBeenCalledWith('one');
    expect(plate.state.selectedId).toBe('one');
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(false);
    canvas.dispatchEvent(pointer('pointerup', { clientX: 25, clientY: 50, timeStamp: 20 }));
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(true);
  });

  it('does not move the object until the 5 px threshold, then moves it on the grab-depth plane without changing Z', () => {
    setup();
    const before = transformJson();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, clientY: 50, timeStamp: 1 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 29, clientY: 50, timeStamp: 10 }));
    expect(transformJson()).toBe(before);
    canvas.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 50, timeStamp: 20 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 40, clientY: 50, timeStamp: 30 }));
    const moved = plate.state.objects[0]!.transform;
    expect(moved.position[0]).toBeGreaterThan(8);
    expect(moved.position[1]).toBeCloseTo(0, 6);
    expect(moved.position[2]).toBe(0);
  });

  it('inverts snapping while Shift is held', () => {
    setup();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, clientY: 50 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 43, clientY: 50, shiftKey: true }));
    expect(Number.isInteger(plate.state.objects[0]!.transform.position[0])).toBe(false);
    canvas.dispatchEvent(pointer('pointermove', { clientX: 43, clientY: 50 }));
    expect(Number.isInteger(plate.state.objects[0]!.transform.position[0])).toBe(true);
  });

  it('does not let a pending empty-space deselect fire while a gizmo handle drag is active', () => {
    const positionalHandles = { hitTest: vi.fn((x: number) => (x < 40 ? { kind: 'ring', axis: 'z' } as GizmoHandle : undefined)),
      setHover: vi.fn(() => false), setPressed: vi.fn(() => false) } as unknown as GizmoView;
    const { onSelect } = setup({ handles: positionalHandles });
    plate.select('one');
    onSelect.mockClear();
    // Tap far from the object and from any handle: schedules a deferred deselect (see emptyTap()).
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 80, clientY: 50, timeStamp: 1 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 80, clientY: 50, timeStamp: 20 }));
    expect(onSelect).not.toHaveBeenCalled();
    // Before that deferred deselect fires, press a ring handle on the still-selected object.
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, clientY: 50, timeStamp: 30 }));
    vi.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS + 5);
    expect(onSelect).not.toHaveBeenCalledWith(undefined);
    expect(plate.state.selectedId).toBe('one');
  });

  it('treats a drag that wanders past the tap threshold and back before release as a drag, not a tap', () => {
    const { onSelect } = setup();
    plate.select('one');
    onSelect.mockClear();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 80, clientY: 50, timeStamp: 1 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 90, timeStamp: 10 })); // crosses the 5px threshold
    canvas.dispatchEvent(pointer('pointerup', { clientX: 80, clientY: 51, timeStamp: 20 })); // back within 5px of start
    vi.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS * 3);
    expect(onSelect).not.toHaveBeenCalled(); // a real drag must never schedule (or fire) the empty-tap deselect
  });

  it('lets a gizmo handle win over the object underneath and restores the camera afterwards', () => {
    const handles = fakeHandles({ kind: 'arrow', axis: 'y' });
    const { controls, onSelect } = setup({ handles });
    plate.select('one');
    onSelect.mockClear();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, clientY: 50 }));
    expect(onSelect).not.toHaveBeenCalled();
    canvas.dispatchEvent(pointer('pointermove', { clientX: 25, clientY: 30 }));
    const position = plate.state.objects[0]!.transform.position;
    expect(position[0]).toBe(0);
    expect(position[1]).not.toBe(0);
    canvas.dispatchEvent(pointer('pointerup', { clientX: 25, clientY: 30 }));
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(true);
  });

  it('keeps empty-space drags with the camera and never touches transforms', () => {
    const { controls, onSelect } = setup();
    const before = transformJson();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 80, clientY: 50, timeStamp: 1 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 70, timeStamp: 10 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 60, clientY: 70, timeStamp: 20 }));
    expect(controls.setPrimaryEnabled).not.toHaveBeenCalledWith(false);
    expect(transformJson()).toBe(before);
    vi.advanceTimersByTime(1000);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('defers the empty-space deselect so a double-tap can fit instead', () => {
    const { onSelect, onFit } = setup();
    plate.select('one');
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 80, timeStamp: 10 })); canvas.dispatchEvent(pointer('pointerup', { clientX: 80, timeStamp: 20 }));
    expect(onSelect).not.toHaveBeenCalled();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 82, timeStamp: 100 })); canvas.dispatchEvent(pointer('pointerup', { clientX: 82, timeStamp: 110 }));
    expect(onFit).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS * 3);
    expect(onSelect).not.toHaveBeenCalled();
    expect(plate.state.selectedId).toBe('one');
  });

  it('deselects after the double-tap window when a single empty tap is not followed by another', () => {
    const { onSelect, onFit } = setup();
    plate.select('one');
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 80, timeStamp: 10 })); canvas.dispatchEvent(pointer('pointerup', { clientX: 80, timeStamp: 20 }));
    vi.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS + 5);
    expect(onSelect).toHaveBeenCalledWith(undefined);
    expect(onFit).not.toHaveBeenCalled();
  });

  it('cancels a one-finger transform when a second finger lands, restoring the object and handing both fingers to the camera', () => {
    const { controls, gizmo } = setup();
    const before = transformJson();
    canvas.dispatchEvent(touch('pointerdown', 1, 25, 50, 1));
    canvas.dispatchEvent(touch('pointermove', 1, 45, 50, 10));
    expect(transformJson()).not.toBe(before);
    canvas.dispatchEvent(touch('pointerdown', 2, 70, 70, 20));
    expect(transformJson()).toBe(before);
    expect(gizmo.active).toBe(false);
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(false);
    canvas.dispatchEvent(touch('pointermove', 1, 60, 50, 30));
    canvas.dispatchEvent(touch('pointermove', 2, 80, 70, 40));
    expect(transformJson()).toBe(before);
    canvas.dispatchEvent(touch('pointerup', 1, 60, 50, 50));
    canvas.dispatchEvent(touch('pointerup', 2, 80, 70, 60));
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(true);
  });

  it('turns a two-finger twist into an azimuth orbit and never a transform', () => {
    const { controls, onSelect } = setup();
    const before = transformJson();
    canvas.dispatchEvent(touch('pointerdown', 1, 70, 50));
    canvas.dispatchEvent(touch('pointerdown', 2, 100, 50));
    canvas.dispatchEvent(touch('pointermove', 2, 100, 60));
    expect(controls.twist).toHaveBeenCalled();
    const swept = controls.twist.mock.calls.reduce((sum, [radians]) => sum + radians, 0);
    expect(Math.abs(swept)).toBeCloseTo(Math.atan2(10, 30), 1);
    expect(transformJson()).toBe(before);
    canvas.dispatchEvent(touch('pointerup', 1, 70, 50)); canvas.dispatchEvent(touch('pointerup', 2, 100, 60));
    vi.advanceTimersByTime(1000);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores the leftover finger after a two-finger gesture until every finger is up', () => {
    const { controls } = setup();
    canvas.dispatchEvent(touch('pointerdown', 1, 80, 50)); canvas.dispatchEvent(touch('pointerdown', 2, 80, 80));
    canvas.dispatchEvent(touch('pointerup', 2, 80, 80));
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(false);
    canvas.dispatchEvent(touch('pointerup', 1, 80, 50));
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(true);
  });

  it('reverts and restores the camera on pointer cancellation', () => {
    const { controls, gizmo } = setup();
    const before = transformJson();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, clientY: 50 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 45, clientY: 50 }));
    expect(gizmo.active).toBe(true);
    canvas.dispatchEvent(pointer('pointercancel', { clientX: 45, clientY: 50 }));
    expect(gizmo.active).toBe(false);
    expect(transformJson()).toBe(before);
    expect(controls.setPrimaryEnabled).toHaveBeenLastCalledWith(true);
  });

  it('leaves right and middle mouse buttons to the camera pan', () => {
    const { controls, gizmo } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, button: 2, buttons: 2 }));
    expect(gizmo.active).toBe(false);
    expect(controls.setPrimaryEnabled).not.toHaveBeenCalledWith(false);
  });

  it('turns smooth trackpad scrolls into a screen pan and leaves notched wheels to camera-controls dolly', () => {
    const { controls } = setup();
    const scroll = new WheelEvent('wheel', { deltaX: 6, deltaY: 12, cancelable: true, bubbles: true });
    canvas.dispatchEvent(scroll);
    expect(controls.panScreen).toHaveBeenCalledWith(-6, -12, 100);
    expect(scroll.defaultPrevented).toBe(true);
    controls.panScreen.mockClear();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, ctrlKey: true, cancelable: true, bubbles: true }));
    expect(controls.panScreen).not.toHaveBeenCalled();
  });

  it('notifies the pivot owner when a transform finishes', () => {
    const { onTransformEnd } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, clientY: 50 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 50 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 40, clientY: 50 }));
    expect(onTransformEnd).toHaveBeenCalledOnce();
  });
});
