import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createGizmo } from './gizmo';
import { createViewerGestures, pointerNdc, TAP_MAX_DISTANCE_PX, TAP_MAX_DURATION_MS } from './gestures';
import { plate } from '../app/stores/plate';

function pointer(type: string, init: PointerEventInit & { timeStamp?: number }) {
  const { timeStamp, ...eventInit } = init;
  const event = new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, ...eventInit });
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
}

function topDownCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function seedObject() {
  plate.clear();
  plate.addObject({ id: 'one', name: 'one.stl', triangleCount: 12, bounds: { min: [-5, -5, 0], max: [5, 5, 10] }, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false] } });
  return plate.state.objects[0]!;
}

describe('viewer gestures', () => {
  it('converts canvas coordinates to normalized device coordinates numerically', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    expect(pointerNdc(canvas, 110, 70)).toEqual([0, 0]);
    expect(pointerNdc(canvas, 10, 20)).toEqual([-1, 1]);
  });

  it('keeps camera gestures from mutating plate transforms', () => {
    seedObject();
    const before = JSON.stringify(plate.state.objects[0]!.transform);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const gestures = createViewerGestures({ canvas, camera: new PerspectiveCamera(), controls, gizmo: createGizmo(), selectedMesh: () => undefined,
      selectedObject: () => plate.state.objects[0], transformMode: () => 'move', meshAt: () => undefined, onSelect: vi.fn(), onFit: vi.fn() });
    canvas.dispatchEvent(pointer('pointerdown', {}));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 75, clientY: 60 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 75, clientY: 60 }));
    expect(JSON.stringify(plate.state.objects[0]!.transform)).toBe(before);
    expect(TAP_MAX_DISTANCE_PX).toBe(10);
    expect(TAP_MAX_DURATION_MS).toBe(250);
    gestures.dispose();
  });

  it('keeps a selected-object tap in the existing select path and deselects on the first elsewhere tap', () => {
    const object = seedObject();
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); mesh.name = 'one';
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const onSelect = vi.fn();
    const meshAt = (x: number) => x < 0 ? mesh : undefined;
    const gestures = createViewerGestures({ canvas, camera: topDownCamera(), controls, gizmo: createGizmo(), selectedMesh: () => mesh,
      selectedObject: () => object, transformMode: () => 'move', meshAt, onSelect, onFit: vi.fn() });

    canvas.dispatchEvent(pointer('pointerdown', { clientX: 25, timeStamp: 1 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 25, timeStamp: 20 }));
    expect(controls.setEnabled).not.toHaveBeenCalledWith(false);
    expect(onSelect).toHaveBeenLastCalledWith('one');

    canvas.dispatchEvent(pointer('pointerdown', { clientX: 90, timeStamp: 400 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 90, timeStamp: 420 }));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(onSelect).toHaveBeenCalledTimes(2);
    gestures.dispose(); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();
  });

  it('preserves the existing double-tap fit path', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const onFit = vi.fn();
    const gestures = createViewerGestures({ canvas, camera: topDownCamera(), controls, gizmo: createGizmo(), selectedMesh: () => undefined,
      selectedObject: () => undefined, transformMode: () => 'move', meshAt: () => undefined, onSelect: vi.fn(), onFit });

    canvas.dispatchEvent(pointer('pointerdown', { timeStamp: 10 })); canvas.dispatchEvent(pointer('pointerup', { timeStamp: 20 }));
    canvas.dispatchEvent(pointer('pointerdown', { timeStamp: 100 })); canvas.dispatchEvent(pointer('pointerup', { timeStamp: 110 }));

    expect(onFit).toHaveBeenCalledOnce();
    gestures.dispose();
  });

  it('commits an interleaved move sequence only after the drag threshold and persists it after release', () => {
    const object = seedObject();
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); mesh.name = 'one';
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const gizmo = createGizmo();
    const gestures = createViewerGestures({ canvas, camera: topDownCamera(), controls, gizmo, selectedMesh: () => mesh,
      selectedObject: () => object, transformMode: () => 'move', meshAt: () => mesh, onSelect: vi.fn(), onFit: vi.fn() });

    canvas.dispatchEvent(pointer('pointerdown', { clientX: 50, clientY: 50, timeStamp: 1 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 58, clientY: 50, timeStamp: 10 }));
    expect(gizmo.active).toBe(false);
    expect(controls.setEnabled).not.toHaveBeenCalledWith(false);
    canvas.dispatchEvent(pointer('pointermove', { clientX: 62, clientY: 50, timeStamp: 20 }));
    expect(gizmo.active).toBe(true);
    canvas.dispatchEvent(pointer('pointermove', { clientX: 75, clientY: 50, timeStamp: 30 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 75, clientY: 50, timeStamp: 40 }));

    expect(gizmo.active).toBe(false);
    expect(plate.state.objects[0]!.transform.position[0]).toBeGreaterThan(0);
    expect(plate.state.objects[0]!.transform.position[2]).toBeCloseTo(0);
    expect(controls.setEnabled).toHaveBeenCalledWith(false);
    expect(controls.setEnabled).toHaveBeenCalledWith(true);
    gestures.dispose(); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();
  });

  it('rotates continuously about Z from cumulative horizontal drag and commits on release', () => {
    const object = seedObject();
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); mesh.name = 'one';
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const gizmo = createGizmo();
    const gestures = createViewerGestures({ canvas, camera: topDownCamera(), controls, gizmo, selectedMesh: () => mesh,
      selectedObject: () => object, transformMode: () => 'rotate', meshAt: () => mesh, onSelect: vi.fn(), onFit: vi.fn() });

    canvas.dispatchEvent(pointer('pointerdown', { clientX: 40, clientY: 50, timeStamp: 1 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 51, clientY: 50, timeStamp: 10 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 61, clientY: 50, timeStamp: 20 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 71, clientY: 50, timeStamp: 30 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 71, clientY: 50, timeStamp: 40 }));

    const rotation = plate.state.objects[0]!.transform.rotation[2];
    expect(rotation).toBeCloseTo(1.256637, 5);
    expect(rotation / (Math.PI / 2)).not.toBeCloseTo(Math.round(rotation / (Math.PI / 2)));
    expect(gizmo.active).toBe(false);
    gestures.dispose(); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();
  });

  it('ends an active transform and restores camera controls on pointer cancellation', () => {
    const object = seedObject();
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); mesh.name = 'one';
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const gizmo = createGizmo();
    const gestures = createViewerGestures({ canvas, camera: topDownCamera(), controls, gizmo, selectedMesh: () => mesh,
      selectedObject: () => object, transformMode: () => 'move', meshAt: () => mesh, onSelect: vi.fn(), onFit: vi.fn() });

    canvas.dispatchEvent(pointer('pointerdown', { clientX: 50, clientY: 50 }));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 61, clientY: 50 }));
    expect(gizmo.active).toBe(true);
    canvas.dispatchEvent(pointer('pointercancel', { clientX: 61, clientY: 50 }));
    expect(gizmo.active).toBe(false);
    expect(controls.setEnabled).toHaveBeenLastCalledWith(true);
    gestures.dispose(); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();
  });
});
