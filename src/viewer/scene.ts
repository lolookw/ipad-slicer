import { AmbientLight, AxesHelper, Box3, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three';
import type { PlateObject } from '../app/stores/plate';
import { createBed, type BedSize } from './bed';
import { getGeometry } from './geometry-cache';
import { createRenderer, rendererLimits, type ViewerRenderer } from './renderer';
import { objectCenter, pickOffsets } from './drag-math';
import { AXIS_NAMES } from './axis';
import { createGizmoView, ringGrabPoint, type GizmoView } from './gizmo-handles';
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
  /**
   * Rebuilds the visible mesh list from the plate store + geometry cache. Cheap: reuses cached
   * geometry. `groupSelectedIds`, when given, is a superset of `selectedId` (group/multi-select):
   * every id in it is drawn as selected, not just the primary — see the SELECTED_COLOR/GROUP_COLOR
   * split below for how the primary still reads as visually distinct from the rest of the group.
   */
  syncObjects(objects: readonly PlateObject[], selectedId: string | undefined, groupSelectedIds?: ReadonlySet<string>): void;
  /** Tolerant pick: tries the exact point, then rays offset by up to `radiusPx` CSS pixels. Returns the mesh and the world hit point. */
  pickAt(ndcX: number, ndcY: number, radiusPx: number): { mesh: Mesh; point: Vector3 } | undefined;
  /** World box of one object, else of every object, else of the empty plate. */
  boundsFor(id: string | undefined): Box3;
  gizmo: GizmoView;
  objectRoot: Group;
  start(): void;
  /** Stops rendering and frees the GPU copies of the plate meshes (CPU arrays stay in the geometry cache). */
  suspend(): void;
  /** Restarts rendering; three re-uploads the CPU arrays on the first frame. */
  resume(): void;
  dispose(): void;
}

const SELECTED_COLOR = 0x60a5fa;
/** A group-selected object that is NOT the primary — lighter than SELECTED_COLOR so the primary
 * (the one the gizmo actually targets) still reads as visually distinct from the rest of the group. */
const GROUP_COLOR = 0x93c5fd;
const DEFAULT_COLOR = 0x9ca3af;

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
  const gizmo = createGizmoView(); scene.add(gizmo.root);
  const bedBox = new Box3(new Vector3(-bedSize.widthMm / 2, -bedSize.depthMm / 2, 0), new Vector3(bedSize.widthMm / 2, bedSize.depthMm / 2, 1));
  const objects = new Group(); objects.name = 'objects'; scene.add(objects);
  const meshes = new Map<string, Mesh>();
  const raycaster = new Raycaster();

  const renderer = await createRenderer(canvas, rendererLimits(tier));

  let dirty = true;
  let running = false;
  let lastTime = 0;
  let frame: number | undefined;
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

  /** Keeps the gizmo at constant screen size and publishes its screen layout (canvas-relative CSS px) for tests and diagnostics. */
  function syncGizmo(): void {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    gizmo.sync(camera, width, height);
    const layout = gizmo.layout(camera, width, height);
    if (!layout) { delete canvas.dataset.gizmo; return; }
    const round = (point: readonly [number, number]) => [Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10];
    const summary: Record<string, unknown> = { center: round(layout.center), arrows: {}, rings: {} };
    for (const axis of AXIS_NAMES) {
      (summary.arrows as Record<string, unknown>)[axis] = round(layout.arrows[axis].tip);
      (summary.rings as Record<string, unknown>)[axis] = round(ringGrabPoint(layout, axis));
    }
    canvas.dataset.gizmo = JSON.stringify(summary);
  }

  function tick(time: number): void {
    if (!running) return;
    const delta = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    let needsRender = dirty;
    for (const callback of frameCallbacks) if (callback(delta)) needsRender = true;
    if (needsRender) { syncGizmo(); renderer.render([scene, camera]); dirty = false; }
    frame = requestAnimationFrame(tick);
  }

  function start(): void { if (running) return; running = true; lastTime = 0; dirty = true; resize(); frame = requestAnimationFrame(tick); }

  return {
    scene, camera, renderer, objectRoot: objects,
    onFrame(callback) { frameCallbacks.add(callback); return () => frameCallbacks.delete(callback); },
    requestRender() { dirty = true; },
    pickAt(ndcX, ndcY, radiusPx) {
      const width = Math.max(canvas.clientWidth, 1); const height = Math.max(canvas.clientHeight, 1);
      // A hidden plate object (Models list eye toggle) is excluded here even though three's own
      // Raycaster does not itself skip invisible objects: mesh.visible is the single source of truth
      // syncObjects below keeps in sync with PlateObject.visible, so filtering on it here is enough.
      const targets = [...meshes.values()].filter(mesh => mesh.visible);
      for (const [dx, dy] of pickOffsets(radiusPx)) {
        raycaster.setFromCamera(new Vector2(ndcX + dx / width * 2, ndcY - dy / height * 2), camera);
        const hit = raycaster.intersectObjects(targets, false)[0];
        if (hit) return { mesh: hit.object as Mesh, point: hit.point.clone() };
      }
      return undefined;
    },
    boundsFor(id) {
      const box = new Box3();
      const mesh = id ? meshes.get(id) : undefined;
      if (mesh) { mesh.updateMatrixWorld(true); return box.setFromObject(mesh); }
      if (meshes.size) { objects.updateMatrixWorld(true); return box.setFromObject(objects); }
      return bedBox.clone();
    },
    gizmo,
    syncObjects(next, selectedId, groupSelectedIds) {
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
        mesh.visible = object.visible !== false;
        const color = object.id === selectedId ? SELECTED_COLOR : groupSelectedIds?.has(object.id) ? GROUP_COLOR : DEFAULT_COLOR;
        (mesh.material as MeshStandardMaterial).color.set(color);
      }
      for (const [id, mesh] of meshes) if (!seen.has(id)) {
        mesh.removeFromParent();
        (mesh.material as MeshStandardMaterial).dispose();
        meshes.delete(id);
      }
      // A hidden selected object hides the gizmo too (mirrors pickAt above): there is nothing visible
      // to grab a handle on, and no other way to reach the gizmo center for it.
      const selected = selectedId ? next.find(object => object.id === selectedId) : undefined;
      gizmo.setCenter(selected && meshes.has(selected.id) && selected.visible !== false ? objectCenter(selected.bounds, selected.transform) : undefined);
      dirty = true;
    },
    start,
    suspend() {
      running = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      // BufferGeometry.dispose() releases the GL buffers; a later render re-uploads from the retained arrays.
      for (const mesh of meshes.values()) { mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); }
      dirty = true;
    },
    resume: start,
    dispose() {
      running = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      frameCallbacks.clear();
      for (const mesh of meshes.values()) (mesh.material as MeshStandardMaterial).dispose();
      meshes.clear();
      gizmo.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
