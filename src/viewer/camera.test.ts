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

describe('viewer gestures', () => {
  it('converts canvas coordinates to normalized device coordinates numerically', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    expect(pointerNdc(canvas, 110, 70)).toEqual([0, 0]);
    expect(pointerNdc(canvas, 10, 20)).toEqual([-1, 1]);
  });

  it('keeps camera gestures from mutating plate transforms', () => {
    plate.clear();
    plate.addObject({ id: 'one', name: 'one.stl', triangleCount: 12, bounds: { min: [0, 0, 0], max: [10, 10, 10] }, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false] } });
    const before = JSON.stringify(plate.state.objects[0]!.transform);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const gestures = createViewerGestures({ canvas, camera: new PerspectiveCamera(), controls, gizmo: createGizmo(), selectedMesh: () => undefined, meshAt: () => undefined, onSelect: vi.fn(), onFit: vi.fn() });
    canvas.dispatchEvent(pointer('pointerdown', {}));
    canvas.dispatchEvent(pointer('pointermove', { clientX: 75, clientY: 60 }));
    canvas.dispatchEvent(pointer('pointerup', { clientX: 75, clientY: 60 }));
    expect(JSON.stringify(plate.state.objects[0]!.transform)).toBe(before);
    expect(TAP_MAX_DISTANCE_PX).toBe(10);
    expect(TAP_MAX_DURATION_MS).toBe(250);
    gestures.dispose();
  });

  it('locks camera input when a pointer starts on the selected object and fits on double tap', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); mesh.name = 'one';
    const controls = { enabled: true, setEnabled: vi.fn(), fit: vi.fn(), update: vi.fn(), dispose: vi.fn() };
    const onFit = vi.fn();
    const gestures = createViewerGestures({ canvas, camera: new PerspectiveCamera(), controls, gizmo: createGizmo(), selectedMesh: () => mesh, meshAt: () => mesh, onSelect: vi.fn(), onFit });
    canvas.dispatchEvent(pointer('pointerdown', { timeStamp: 1 }));
    expect(controls.setEnabled).toHaveBeenCalledWith(false);
    canvas.dispatchEvent(pointer('pointerup', { timeStamp: 2 }));
    // Deselect ownership for the tap-only double-tap path.
    gestures.dispose();
    const taps = createViewerGestures({ canvas, camera: new PerspectiveCamera(), controls, gizmo: createGizmo(), selectedMesh: () => undefined, meshAt: () => undefined, onSelect: vi.fn(), onFit });
    canvas.dispatchEvent(pointer('pointerdown', { timeStamp: 10 })); canvas.dispatchEvent(pointer('pointerup', { timeStamp: 20 }));
    canvas.dispatchEvent(pointer('pointerdown', { timeStamp: 100 })); canvas.dispatchEvent(pointer('pointerup', { timeStamp: 110 }));
    expect(onFit).toHaveBeenCalledOnce();
    taps.dispose(); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();
  });
});
