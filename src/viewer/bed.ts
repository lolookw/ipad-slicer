import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import type { NativeSettings } from '../catalog/types';
import { createFatLine } from './fat-lines';

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

const GRID_DIVISIONS = 10;
const GRID_LINE_COLOR = 0x1f2937;
const GRID_CENTER_COLOR = 0x374151;
const OUTLINE_COLOR = 0x9ca3af;

/**
 * Positions (xyz per vertex, consecutive pairs = one segment) for every grid line whose division
 * index passes `keep` — a horizontal + a vertical line per step, same layout as THREE.GridHelper,
 * just built directly in the XY plane (Z-up) instead of XZ-then-rotated.
 */
function gridLinePositions(size: number, divisions: number, keep: (index: number) => boolean): number[] {
  const half = size / 2;
  const step = size / divisions;
  const positions: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    if (!keep(i)) continue;
    const k = -half + i * step;
    positions.push(-half, k, 0, half, k, 0, k, -half, 0, k, half, 0);
  }
  return positions;
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

  const halfW = size.widthMm / 2; const halfD = size.depthMm / 2;
  const outline = createFatLine([
    -halfW, -halfD, 0, halfW, -halfD, 0,
    halfW, -halfD, 0, halfW, halfD, 0,
    halfW, halfD, 0, -halfW, halfD, 0,
    -halfW, halfD, 0, -halfW, -halfD, 0,
  ], OUTLINE_COLOR, 1.5);
  outline.name = 'bed-outline';

  const gridSize = Math.max(size.widthMm, size.depthMm);
  const centerIndex = GRID_DIVISIONS / 2;
  const gridLines = createFatLine(gridLinePositions(gridSize, GRID_DIVISIONS, i => i !== centerIndex), GRID_LINE_COLOR, 1);
  gridLines.name = 'bed-grid';
  const centerLines = createFatLine(gridLinePositions(gridSize, GRID_DIVISIONS, i => i === centerIndex), GRID_CENTER_COLOR, 1.5);
  centerLines.name = 'bed-grid-center';

  group.add(plate, outline, gridLines, centerLines);
  return group;
}
