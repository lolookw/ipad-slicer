import CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { PerspectiveCamera, Object3D } from 'three';
import type { Viewer } from './scene';

CameraControls.install({ THREE });

export interface ViewerCameraControls {
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
  fit(object: Object3D): Promise<void>;
  update(deltaSeconds: number): boolean;
  dispose(): void;
}

/** camera-controls owns orbit/dolly/truck input; the app only supplies Z-up defaults and lifecycle. */
export function createCameraControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
): ViewerCameraControls {
  const controls = new CameraControls(camera, canvas);
  controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
  controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
  controls.touches.three = CameraControls.ACTION.TOUCH_TRUCK;
  controls.dollyToCursor = true;
  controls.minDistance = 1;
  controls.maxDistance = 20_000;

  return {
    get enabled() { return controls.enabled; },
    setEnabled(enabled) { controls.enabled = enabled; if (!enabled) controls.cancel(); },
    async fit(object) { await controls.fitToBox(object, true, { paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }); },
    update(deltaSeconds) { return controls.update(deltaSeconds); },
    dispose() { controls.dispose(); },
  };
}

export function attachCameraControls(viewer: Viewer): ViewerCameraControls {
  const controls = createCameraControls(viewer.camera, viewer.renderer.domElement);
  const removeFrame = viewer.onFrame(delta => controls.update(delta));
  const dispose = controls.dispose.bind(controls);
  controls.dispose = () => { removeFrame(); dispose(); };
  return controls;
}
