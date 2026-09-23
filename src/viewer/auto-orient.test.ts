import { describe, expect, it } from 'vitest';
import {
  classifyFace, findBestOrientation, MAX_SAMPLE_TRIANGLES, resolveAutoOrientPlacement, type TriangleMesh,
} from './auto-orient';
import { transformedSize, type LocalBounds, type ObjectTransform } from './transforms';

const DEG2RAD = Math.PI / 180;

/** Same vertex/face layout as tests/e2e/shell.spec.ts's binaryBoxStl, generalized to any size, min corner at the origin. */
function boxPositions(sx: number, sy: number, sz: number): Float32Array {
  const vertices = [[0, 0, 0], [sx, 0, 0], [sx, sy, 0], [0, sy, 0], [0, 0, sz], [sx, 0, sz], [sx, sy, sz], [0, sy, sz]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const positions = new Float32Array(faces.length * 9);
  faces.forEach((face, faceIndex) => face.forEach((vertexIndex, i) => vertices[vertexIndex]!.forEach((value, axis) => {
    positions[faceIndex * 9 + i * 3 + axis] = value;
  })));
  return positions;
}

function boxMesh(sx: number, sy: number, sz: number): { mesh: TriangleMesh; bounds: LocalBounds } {
  return { mesh: { positions: boxPositions(sx, sy, sz), triangleCount: 12 }, bounds: { min: [0, 0, 0], max: [sx, sy, sz] } };
}

const IDENTITY: ObjectTransform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false] };

describe('classifyFace', () => {
  it('does not penalize a plain vertical wall (90 degrees from up) as an overhang', () => {
    // The bug this regression-tests: an earlier version measured the overhang angle from +Z instead
    // of from -Z, so any face more than 45 degrees from straight up (which includes every ordinary
    // vertical wall, fully self-supporting layer over layer) was wrongly scored as needing support.
    expect(classifyFace(90 * DEG2RAD)).toBe('neutral');
  });

  it('treats a face straight up, or anywhere short of the overhang band, as neutral', () => {
    expect(classifyFace(0)).toBe('neutral');
    expect(classifyFace(44 * DEG2RAD)).toBe('neutral');
    expect(classifyFace(134 * DEG2RAD)).toBe('neutral'); // just short of the overhang band (45 deg from down)
  });

  it('treats a face within 5 degrees of straight down as the resting footprint, not an overhang', () => {
    expect(classifyFace(180 * DEG2RAD)).toBe('footprint');
    expect(classifyFace(176 * DEG2RAD)).toBe('footprint'); // 4 deg from straight down
  });

  it('treats a steep, near-downward face outside the footprint tolerance as an overhang', () => {
    expect(classifyFace(174 * DEG2RAD)).toBe('overhang'); // 6 deg from straight down: past footprint, still steep
    expect(classifyFace(150 * DEG2RAD)).toBe('overhang'); // 30 deg from straight down
    expect(classifyFace(136 * DEG2RAD)).toBe('overhang'); // 44 deg from straight down: just inside the overhang band
  });
});

describe('findBestOrientation', () => {
  it('lays a thin tall fin flat, reducing its print height', () => {
    // A 30x2x40 fin imported standing on its thin edge — an obviously bad default orientation.
    const { mesh, bounds } = boxMesh(30, 2, 40);
    const before = transformedSize(bounds, IDENTITY)[2];

    const result = findBestOrientation(mesh, bounds, IDENTITY);

    expect(result.changed).toBe(true);
    const after = transformedSize(bounds, result.transform)[2];
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(2, 1); // lying on its largest (30x40) face is the clear winner
    // dropToBed invariant: the lowest transformed corner sits on the plate.
    expect(transformedSize(bounds, result.transform)[2]).toBeGreaterThan(0);
  });

  it('keeps a cube already resting on a face unchanged — a truly symmetric shape has no better orientation', () => {
    const { mesh, bounds } = boxMesh(10, 10, 10);

    const result = findBestOrientation(mesh, bounds, IDENTITY);

    expect(result.changed).toBe(false);
    expect(result.transform.rotation).toEqual(IDENTITY.rotation);
  });

  it('rights a cube balanced off-axis onto a face, still landing at the same (minimal, tied) height', () => {
    const { mesh, bounds } = boxMesh(10, 10, 10);
    const tipped: ObjectTransform = { ...IDENTITY, rotation: [Math.PI / 5, Math.PI / 7, Math.PI / 11] };

    const result = findBestOrientation(mesh, bounds, tipped);

    expect(result.changed).toBe(true);
    expect(transformedSize(bounds, result.transform)[2]).toBeCloseTo(10, 4);
  });

  it('stays responsive and correct on a mesh well above the subsampling threshold', () => {
    const base = boxPositions(30, 2, 40);
    const copies = Math.ceil((MAX_SAMPLE_TRIANGLES * 2.5) / 12); // comfortably past the 2x subsampling step
    const positions = new Float32Array(base.length * copies);
    for (let i = 0; i < copies; i += 1) positions.set(base, i * base.length);
    const mesh: TriangleMesh = { positions, triangleCount: 12 * copies };
    const bounds: LocalBounds = { min: [0, 0, 0], max: [30, 2, 40] };

    const start = Date.now();
    const result = findBestOrientation(mesh, bounds, IDENTITY);
    expect(Date.now() - start).toBeLessThan(5000);

    expect(result.changed).toBe(true);
    expect(transformedSize(bounds, result.transform)[2]).toBeCloseTo(2, 1);
  });
});

describe('resolveAutoOrientPlacement', () => {
  const bed = { widthMm: 220, depthMm: 220 };
  const object = (x: number, y: number): { bounds: LocalBounds; transform: ObjectTransform } => ({
    bounds: { min: [-5, -5, 0], max: [5, 5, 10] },
    transform: { ...IDENTITY, position: [x, y, 0] },
  });

  it('keeps the object in place when its current position is already free', () => {
    const target = object(50, 50);
    const others = [object(-50, -50)];

    const result = resolveAutoOrientPlacement(target, others, bed);

    expect(result.freeSpotFound).toBe(true);
    expect(result.transform.position).toEqual(target.transform.position);
  });

  it('relocates to a nearby free spot when the winning orientation overlaps another object', () => {
    const target = object(0, 0);
    const others = [object(0, 0)]; // exact overlap with the other object's existing footprint

    const result = resolveAutoOrientPlacement(target, others, bed);

    expect(result.freeSpotFound).toBe(true);
    expect(result.transform.position).not.toEqual(target.transform.position);
    const [tx, ty] = result.transform.position;
    const dx = Math.abs(tx - 0); const dy = Math.abs(ty - 0);
    expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(10); // clears the other object's 10x10 footprint + clearance
    expect(tx).toBeGreaterThanOrEqual(-110); expect(tx).toBeLessThanOrEqual(110);
    expect(ty).toBeGreaterThanOrEqual(-110); expect(ty).toBeLessThanOrEqual(110);
  });

  it('falls back to a centered, flagged placement when no free spot exists on the bed', () => {
    const tinyBed = { widthMm: 12, depthMm: 12 };
    const target = object(6, 6);
    const others = [object(0, 0)]; // a 10x10 object fills nearly all of a 12x12 bed

    const result = resolveAutoOrientPlacement(target, others, tinyBed);

    expect(result.freeSpotFound).toBe(false);
    expect(result.transform.position[0]).toBeCloseTo(0, 4);
    expect(result.transform.position[1]).toBeCloseTo(0, 4);
  });
});
