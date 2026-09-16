import { BufferGeometry, Float32BufferAttribute, Group, GridHelper, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial } from 'three';
import type { NativeSettings } from '../catalog/types';

export interface BedSize { widthMm: number; depthMm: number; heightMm: number }

function parsePoint(value: string): [number, number] {
  const [x, y] = value.split('x').map(Number);
  return [x ?? 0, y ?? 0];
}

/** Reads the printer's printable_area polygon (bounding box) and printable_height from resolved settings. */
export function bedSizeFromSettings(settings: NativeSettings): BedSize {
  const area = settings.printable_area;
  const points = (Array.isArray(area) ? area : [area ?? '0x0']).map((value) => parsePoint(String(value)));
  const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
  const heightValue = settings.printable_height;
  return {
    widthMm: Math.max(...xs, 1) - Math.min(...xs, 0),
    depthMm: Math.max(...ys, 1) - Math.min(...ys, 0),
    heightMm: Number(Array.isArray(heightValue) ? heightValue[0] : heightValue) || 250,
  };
}

/** A Z-up bed: a translucent plate at z=0 plus a grid, sized in millimeters, centered on the origin. */
export function createBed(size: BedSize): Group {
  const group = new Group();
  group.name = 'bed';
  const plate = new Mesh(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
      -size.widthMm / 2, -size.depthMm / 2, 0, size.widthMm / 2, -size.depthMm / 2, 0,
      size.widthMm / 2, size.depthMm / 2, 0, -size.widthMm / 2, size.depthMm / 2, 0,
    ], 3)).setIndex([0, 1, 2, 0, 2, 3]),
    new MeshBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  plate.name = 'bed-plate';
  const outline = new LineLoop(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
      -size.widthMm / 2, -size.depthMm / 2, 0, size.widthMm / 2, -size.depthMm / 2, 0,
      size.widthMm / 2, size.depthMm / 2, 0, -size.widthMm / 2, size.depthMm / 2, 0,
    ], 3)),
    new LineBasicMaterial({ color: 0x9ca3af }),
  );
  const grid = new GridHelper(Math.max(size.widthMm, size.depthMm), 10, 0x374151, 0x1f2937);
  grid.rotateX(Math.PI / 2); // GridHelper is XZ by default; the bed plane here is XY (Z-up).
  group.add(plate, outline, grid);
  return group;
}
