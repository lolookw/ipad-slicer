import { AmbientLight, AxesHelper, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Scene, Vector2 } from 'three';
import type { PlateObject } from '../app/stores/plate';
import { createBed, type BedSize } from './bed';
import { getGeometry } from './geometry-cache';
import { createRenderer, rendererLimits, type ViewerRenderer } from './renderer';
import { AXIS_COLORS } from './axis';
import { applyTransform } from './transforms';
import type { TierDecision } from '../app/tier/decide';

export type FrameCallback = (deltaSeconds: number) => boolean | void;

export interface Viewer {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: ViewerRenderer;
  /** Registers a per-frame updater (e.g. camera-controls.update). Returning true requests a render. */
  onFrame(callback: FrameCallback): () => void;
  /** Marks the next frame dirty even if no onFrame callback reported a change (e.g. after a gizmo edit). */
  requestRender(): void;
  /** Rebuilds the visible mesh list from the plate store + geometry cache. Cheap: reuses cached geometry. */
  syncObjects(objects: readonly PlateObject[], selectedId: string | undefined): void;
  meshFor(id: string): Mesh | undefined;
  meshAt(ndcX: number, ndcY: number): Mesh | undefined;
  objectRoot: Group;
  start(): void;
  dispose(): void;
}

const SELECTED_COLOR = 0x60a5fa;
const DEFAULT_COLOR = 0x9ca3af;

/** Unit-length X/Y/Z lines in both directions through the origin; scaled and moved onto the selected object. */
function createSelectionAxes(): Group {
  const group = new Group();
  group.name = 'selection-axes';
  group.visible = false;
  const ends: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  (['x', 'y', 'z'] as const).forEach((axis, index) => {
    const end = ends[index]!;
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-end[0], -end[1], -end[2], ...end], 3));
    const line = new LineSegments(geometry, new LineBasicMaterial({ color: AXIS_COLORS[axis], depthTest: false, transparent: true }));
    line.renderOrder = 10;
    group.add(line);
  });
  return group;
}

/**
 * Owns the Scene/Camera/Renderer and a minimal on-demand render loop (not a constant RAF render):
 * a frame is only drawn when an onFrame callback reports a change or requestRender() was called.
 * Z-up, millimeters, matching the engine and the bed's own convention (design.md §7/§8).
 */
export async function createViewer(canvas: HTMLCanvasElement, bedSize: BedSize, tier: TierDecision['tier']): Promise<Viewer> {
  const scene = new Scene();
  scene.background = new Color(0x0b1220);
  const camera = new PerspectiveCamera(45, 1, 0.1, 10_000);
  camera.up.set(0, 0, 1);
  camera.position.set(bedSize.widthMm * 0.8, -bedSize.depthMm * 1.4, bedSize.heightMm * 0.9);
  camera.lookAt(0, 0, bedSize.heightMm / 4);

  scene.add(new AmbientLight(0xffffff, 0.6));
  const key = new DirectionalLight(0xffffff, 0.8); key.position.set(200, -200, 400); scene.add(key);

  const bed = createBed(bedSize); scene.add(bed);
  const origin = new AxesHelper(30); // X red, Y green, Z blue, at the plate corner
  origin.position.set(-bedSize.widthMm / 2, -bedSize.depthMm / 2, 0);
  origin.name = 'origin-axes';
  scene.add(origin);
  const selectionAxes = createSelectionAxes(); scene.add(selectionAxes);
  const objects = new Group(); objects.name = 'objects'; scene.add(objects);
  const meshes = new Map<string, Mesh>();
  const raycaster = new Raycaster();

  const renderer = await createRenderer(canvas, rendererLimits(tier));

  let dirty = true;
  let running = false;
  let lastTime = 0;
  const frameCallbacks = new Set<FrameCallback>();

  function resize(): void {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
    dirty = true;
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function tick(time: number): void {
    if (!running) return;
    const delta = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    let needsRender = dirty;
    for (const callback of frameCallbacks) if (callback(delta)) needsRender = true;
    if (needsRender) { renderer.render([scene, camera]); dirty = false; }
    requestAnimationFrame(tick);
  }

  return {
    scene, camera, renderer, objectRoot: objects,
    onFrame(callback) { frameCallbacks.add(callback); return () => frameCallbacks.delete(callback); },
    requestRender() { dirty = true; },
    meshFor(id) { return meshes.get(id); },
    meshAt(ndcX, ndcY) {
      raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
      return raycaster.intersectObjects([...meshes.values()], false)[0]?.object as Mesh | undefined;
    },
    syncObjects(next, selectedId) {
      const seen = new Set<string>();
      for (const object of next) {
        seen.add(object.id);
        let mesh = meshes.get(object.id);
        const geometry = getGeometry(object.id);
        if (!geometry) continue; // buffers not loaded yet (import still in flight)
        if (!mesh || mesh.geometry !== geometry) {
          if (mesh) { mesh.removeFromParent(); (mesh.material as MeshStandardMaterial).dispose(); }
          mesh = new Mesh(geometry, new MeshStandardMaterial({ color: DEFAULT_COLOR, roughness: 0.6, metalness: 0.05 }));
          mesh.name = object.id;
          objects.add(mesh);
          meshes.set(object.id, mesh);
        }
        applyTransform(mesh, object.transform);
        (mesh.material as MeshStandardMaterial).color.set(object.id === selectedId ? SELECTED_COLOR : DEFAULT_COLOR);
      }
      for (const [id, mesh] of meshes) if (!seen.has(id)) {
        mesh.removeFromParent();
        (mesh.material as MeshStandardMaterial).dispose();
        meshes.delete(id);
      }
      const selected = selectedId ? next.find(object => object.id === selectedId) : undefined;
      selectionAxes.visible = Boolean(selected && meshes.has(selected.id));
      if (selected) {
        const [sx, sy, sz] = selected.transform.scale;
        const reach = Math.max(...selected.bounds.max.map((v, i) => Math.max(Math.abs(v), Math.abs(selected.bounds.min[i]!)) * [sx, sy, sz][i]!)) + 15;
        selectionAxes.position.set(...selected.transform.position);
        selectionAxes.scale.setScalar(reach);
      }
      dirty = true;
    },
    start() { if (running) return; running = true; resize(); requestAnimationFrame(tick); },
    dispose() {
      running = false;
      resizeObserver.disconnect();
      frameCallbacks.clear();
      for (const mesh of meshes.values()) (mesh.material as MeshStandardMaterial).dispose();
      meshes.clear();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
