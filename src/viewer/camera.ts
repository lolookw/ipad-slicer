import CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { Box3, PerspectiveCamera } from 'three';
import { screenPanDelta, tightClipPlanes } from './drag-math';
import type { Viewer } from './scene';

CameraControls.install({ THREE });

export type ViewPreset = 'top' | 'front' | 'iso';

/** Unit-ish view directions from the target toward the camera (Z up, plate front toward -Y). */
export const VIEW_DIRECTIONS: Record<ViewPreset, [number, number, number]> = {
  // Straight down is degenerate with Z-up; a hair of tilt keeps the camera basis stable.
  top: [0, -0.02, 1],
  front: [0, -1, 0],
  iso: [1, -1.2, 0.9],
};

export interface ViewerCameraControls {
  readonly enabled: boolean;
  /** Enables/disables the one-pointer camera action (left mouse, one finger). Wheel, right/middle drag and two-finger touch stay live. */
  setPrimaryEnabled(enabled: boolean): void;
  /** Frames `box`; keeps the current view direction unless a preset is named. */
  fit(box: Box3, preset?: ViewPreset): Promise<void>;
  /** Makes `point` the orbit pivot without changing what the camera sees. */
  setPivot(x: number, y: number, z: number): void;
  /** Screen-space pan by pixels; positive dx moves the scene with the finger. */
  panScreen(dxPx: number, dyPx: number, viewportHeightPx: number): void;
  /** Horizontal orbit by a two-finger twist; positive turns the scene clockwise seen from above. */
  twist(radians: number): void;
  update(deltaSeconds: number): boolean;
  dispose(): void;
}

/** Camera distance at which a sphere of `radius` fills the smaller field of view with a little margin. */
export function fitDistance(radius: number, verticalFovDegrees: number, aspect: number): number {
  const vertical = verticalFovDegrees * Math.PI / 360;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 0.1));
  return Math.max(radius, 1) * 1.15 / Math.sin(Math.min(vertical, horizontal));
}

/** camera-controls owns orbit/dolly/pan input; the app supplies Z-up defaults, pivots, presets and lifecycle. */
export function createCameraControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement): ViewerCameraControls {
  const controls = new CameraControls(camera, canvas);
  const oneAction = CameraControls.ACTION.ROTATE;
  const oneTouch = CameraControls.ACTION.TOUCH_ROTATE;
  controls.mouseButtons.left = oneAction;
  controls.mouseButtons.right = CameraControls.ACTION.SCREEN_PAN;
  controls.mouseButtons.middle = CameraControls.ACTION.SCREEN_PAN;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controls.touches.one = oneTouch;
  // Supported at runtime by camera-controls 2.x but missing from its `multiTouchAction` typing.
  controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_SCREEN_PAN as unknown as typeof CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
  controls.touches.three = CameraControls.ACTION.TOUCH_SCREEN_PAN;
  controls.dollyToCursor = true;
  controls.minDistance = 1;
  controls.maxDistance = 20_000;

  /** camera-controls stores a pivot as a focal offset. Drop it without changing the picture, so a fit starts from a clean rig. */
  const normalize = () => {
    camera.updateMatrixWorld();
    const position = camera.position.clone();
    const target = position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(controls.distance));
    controls.setFocalOffset(0, 0, 0, false);
    void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false);
  };

  return {
    get enabled() { return controls.enabled; },
    setPrimaryEnabled(enabled) {
      controls.mouseButtons.left = enabled ? oneAction : CameraControls.ACTION.NONE;
      controls.touches.one = enabled ? oneTouch : CameraControls.ACTION.NONE;
    },
    async fit(box, preset) {
      if (box.isEmpty()) return;
      normalize();
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      const direction = preset
        ? new THREE.Vector3(...VIEW_DIRECTIONS[preset]).normalize()
        : camera.position.clone().sub(controls.getTarget(new THREE.Vector3())).normalize();
      const position = center.clone().addScaledVector(direction, fitDistance(radius, camera.fov, camera.aspect));
      await controls.setLookAt(position.x, position.y, position.z, center.x, center.y, center.z, true);
    },
    setPivot(x, y, z) { controls.setOrbitPoint(x, y, z); },
    panScreen(dxPx, dyPx, viewportHeightPx) {
      const target = controls.getTarget(new THREE.Vector3());
      const delta = screenPanDelta(camera, target, dxPx, dyPx, viewportHeightPx);
      void controls.moveTo(target.x + delta.x, target.y + delta.y, target.z + delta.z, false);
    },
    twist(radians) { void controls.rotate(radians, 0, false); },
    update(deltaSeconds) { return controls.update(deltaSeconds); },
    dispose() { controls.dispose(); },
  };
}

export interface SceneSphere { center: [number, number, number]; radius: number }

export function attachCameraControls(viewer: Viewer, sphere: SceneSphere): ViewerCameraControls {
  const controls = createCameraControls(viewer.camera, viewer.renderer.domElement);
  const center = new THREE.Vector3(...sphere.center);
  const removeFrame = viewer.onFrame(delta => {
    let changed = controls.update(delta);
    const planes = tightClipPlanes(viewer.camera.position.distanceTo(center), sphere.radius);
    if (Math.abs(planes.near - viewer.camera.near) > 0.05 || Math.abs(planes.far - viewer.camera.far) > 0.5) {
      viewer.camera.near = planes.near; viewer.camera.far = planes.far;
      viewer.camera.updateProjectionMatrix();
      changed = true;
    }
    return changed;
  });
  const dispose = controls.dispose.bind(controls);
  controls.dispose = () => { removeFrame(); dispose(); };
  return controls;
}
