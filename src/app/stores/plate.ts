import { createStore, produce } from 'solid-js/store';
import type { ObjectMaterial } from '../../viewer/import-types';
import { dropToBed, IDENTITY_TRANSFORM, rotate90, type LocalBounds, type ObjectTransform } from '../../viewer/transforms';

export interface PlateObject {
  id: string;
  name: string;
  transform: ObjectTransform;
  triangleCount: number;
  /** Local (untransformed) geometry bounds in millimeters — the actual position/normal
   * buffers live in src/viewer/geometry-cache.ts, never in this store (see design.md: three.js
   * objects, ArrayBuffers and Blobs never go in a Solid store — proxies break or copy them). */
  bounds: LocalBounds;
  /** 1-based extruder/filament slot from the source file, when declared. Informational until multi-material printing exists. */
  extruder?: number;
  /** Colors/materials declared by the source file. An object may carry several; nothing assumes a single material. */
  materials?: ObjectMaterial[];
}

export interface PlateState { objects: PlateObject[]; selectedId: string | undefined }

const [state, setState] = createStore<PlateState>({ objects: [], selectedId: undefined });

/**
 * dropToBed only computes a correct absolute world-Z=0 seat when handed a transform whose position.z
 * is already 0 (it returns `transform.position[2] - minZ`, so any pre-existing, generally non-zero,
 * position.z leaks straight into the result instead of being replaced by it). Every caller here needs
 * to re-seat from a clean baseline, not add to wherever the object already happened to be, so this
 * zeroes position.z first — the same convention axis.ts's keepAbovePlate and drag-math.ts's plateSeatZ
 * already use.
 */
function seatOnBed(bounds: LocalBounds, transform: ObjectTransform): ObjectTransform {
  return dropToBed(bounds, { ...transform, position: [transform.position[0], transform.position[1], 0] });
}

export const plate = {
  state,
  addObject(object: PlateObject): void {
    setState('objects', (objects) => [...objects, { ...object, transform: seatOnBed(object.bounds, object.transform) }]);
    setState('selectedId', object.id);
  },
  removeObject(id: string): void {
    setState(produce((draft) => {
      draft.objects = draft.objects.filter((object) => object.id !== id);
      if (draft.selectedId === id) draft.selectedId = draft.objects.at(-1)?.id;
    }));
  },
  duplicateObject(id: string, newId: string): void {
    const source = state.objects.find((object) => object.id === id);
    if (!source) return;
    const offset: ObjectTransform = { ...source.transform, position: [source.transform.position[0] + 10, source.transform.position[1] + 10, source.transform.position[2]] };
    setState('objects', (objects) => [...objects, { ...source, id: newId, name: `${source.name} copy`, transform: offset }]);
    setState('selectedId', newId);
  },
  select(id: string | undefined): void { setState('selectedId', id); },
  updateTransform(id: string, transform: ObjectTransform, options: { dropToBed?: boolean } = {}): void {
    const index = state.objects.findIndex((object) => object.id === id);
    if (index < 0) return;
    const bounds = state.objects[index]!.bounds;
    setState('objects', index, 'transform', options.dropToBed === false ? transform : seatOnBed(bounds, transform));
  },
  rotate90(id: string, axis: 'x' | 'y'): void {
    const object = state.objects.find((item) => item.id === id);
    if (object) this.updateTransform(id, rotate90(object.transform, axis));
  },
  resetTransform(id: string): void {
    const object = state.objects.find((item) => item.id === id);
    if (object) this.updateTransform(id, IDENTITY_TRANSFORM);
  },
  /** Replaces every transform at once — the shape onewasm_prepare_plate returns applies here. */
  applyPreparedTransforms(transforms: ReadonlyMap<string, ObjectTransform>): void {
    setState('objects', produce((objects) => {
      for (const object of objects) { const next = transforms.get(object.id); if (next) object.transform = next; }
    }));
  },
  clear(): void { setState({ objects: [], selectedId: undefined }); },
};

export function selectedObject(): PlateObject | undefined {
  return state.objects.find((object) => object.id === state.selectedId);
}
