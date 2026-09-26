import { describe, expect, it } from 'vitest';
import type { MeshBuffers } from './geometry-cache';
import { repairMesh } from './mesh-repair';

type Point = [number, number, number];

/** Builds non-indexed MeshBuffers exactly the shape STLLoader/stl-parse.ts produces: every
 * triangle owns its own private 3x3 floats, even where it shares a corner with another triangle. */
function buildMesh(triangles: [Point, Point, Point][]): MeshBuffers {
  const triangleCount = triangles.length;
  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  triangles.forEach(([a, b, c], t) => {
    const base = t * 9;
    positions.set(a, base); positions.set(b, base + 3); positions.set(c, base + 6);
    // Placeholder flat normal: repairMesh only reads positions and recomputes normals itself.
    normals.set([0, 0, 1], base); normals.set([0, 0, 1], base + 3); normals.set([0, 0, 1], base + 6);
    for (const p of [a, b, c]) {
      minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); minZ = Math.min(minZ, p[2]);
      maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); maxZ = Math.max(maxZ, p[2]);
    }
  });
  return { positions, normals, bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }, triangleCount };
}

/** Re-welds an output MeshBuffers' non-indexed positions (same grid mesh-repair.ts itself uses)
 * purely for these tests' own correctness checks — never exported, never used by production code. */
function weldIndices(mesh: MeshBuffers): number[] {
  const map = new Map<string, number>();
  const indices: number[] = [];
  for (let v = 0; v < mesh.triangleCount * 3; v++) {
    const x = mesh.positions[v * 3]!, y = mesh.positions[v * 3 + 1]!, z = mesh.positions[v * 3 + 2]!;
    const key = `${Math.round(x / 1e-4)}_${Math.round(y / 1e-4)}_${Math.round(z / 1e-4)}`;
    let index = map.get(key);
    if (index === undefined) { index = map.size; map.set(key, index); }
    indices.push(index);
  }
  return indices;
}

function edgeUsage(mesh: MeshBuffers): Map<string, boolean[]> {
  const indices = weldIndices(mesh);
  const edges = new Map<string, boolean[]>();
  for (let t = 0; t < mesh.triangleCount; t++) {
    const tri = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!];
    for (let slot = 0; slot < 3; slot++) {
      const from = tri[slot]!, to = tri[(slot + 1) % 3]!;
      const key = from < to ? `${from}_${to}` : `${to}_${from}`;
      const forward = from < to;
      const list = edges.get(key);
      if (list) list.push(forward); else edges.set(key, [forward]);
    }
  }
  return edges;
}

/** Every undirected edge must be used by exactly 2 triangles for a mesh to be topologically closed. */
function isClosedManifold(mesh: MeshBuffers): boolean {
  return [...edgeUsage(mesh).values()].every(uses => uses.length === 2);
}

/** Closed AND every shared edge stored in opposite directions by its two triangles. */
function isConsistentlyOriented(mesh: MeshBuffers): boolean {
  return [...edgeUsage(mesh).values()].every(uses => uses.length === 2 && uses[0] !== uses[1]);
}

// Tetrahedron A,B,C,D with each of the 4 faces wound so its normal points away from the opposite vertex.
const A: Point = [0, 0, 0];
const B: Point = [1, 0, 0];
const C: Point = [0, 1, 0];
const D: Point = [0, 0, 1];
const faceOppositeA: [Point, Point, Point] = [B, C, D];
const faceOppositeB: [Point, Point, Point] = [A, D, C];
const faceOppositeC: [Point, Point, Point] = [A, B, D];
const faceOppositeD: [Point, Point, Point] = [A, C, B];

// Unit cube corners and its 12 outward-wound triangles (2 per face), built as literal per-triangle
// float triples (never pre-indexed) so shared corners appear as separate coordinates, like a real STL.
const V000: Point = [0, 0, 0], V100: Point = [1, 0, 0], V110: Point = [1, 1, 0], V010: Point = [0, 1, 0];
const V001: Point = [0, 0, 1], V101: Point = [1, 0, 1], V111: Point = [1, 1, 1], V011: Point = [0, 1, 1];
const cubeTriangles: [Point, Point, Point][] = [
  [V000, V010, V110], [V000, V110, V100], // bottom (-z)
  [V001, V101, V111], [V001, V111, V011], // top (+z)
  [V000, V100, V101], [V000, V101, V001], // front (-y)
  [V010, V111, V110], [V010, V011, V111], // back (+y)
  [V000, V001, V011], [V000, V011, V010], // left (-x)
  [V100, V110, V111], [V100, V111, V101], // right (+x)
];

describe('repairMesh', () => {
  it('leaves a correctly wound, closed tetrahedron untouched', () => {
    const mesh = buildMesh([faceOppositeA, faceOppositeB, faceOppositeC, faceOppositeD]);
    const { meshBuffers, report } = repairMesh(mesh);

    expect(report.wasModified).toBe(false);
    expect(report.trianglesRemoved).toBe(0);
    expect(report.holesFilled).toBe(0);
    expect(report.facesFlipped).toBe(0);
    expect(meshBuffers.triangleCount).toBe(4);
  });

  it('caps a tetrahedron missing one face', () => {
    const mesh = buildMesh([faceOppositeA, faceOppositeB, faceOppositeC]); // face opposite D dropped
    const { meshBuffers, report } = repairMesh(mesh);

    expect(report.holesFilled).toBe(1);
    expect(report.holesRemaining).toBe(0);
    expect(meshBuffers.triangleCount).toBe(4); // 3 original + 1 new cap
    expect(isClosedManifold(meshBuffers)).toBe(true);
    expect(isConsistentlyOriented(meshBuffers)).toBe(true); // the cap itself must wind the right way, not just close the gap
  });

  it('flips one inconsistently wound face on an otherwise closed tetrahedron', () => {
    const flippedFaceOppositeA: [Point, Point, Point] = [B, D, C]; // two vertices swapped
    const mesh = buildMesh([flippedFaceOppositeA, faceOppositeB, faceOppositeC, faceOppositeD]);
    const { meshBuffers, report } = repairMesh(mesh);

    expect(report.facesFlipped).toBe(1);
    expect(report.wasModified).toBe(true);
    expect(isConsistentlyOriented(meshBuffers)).toBe(true);
  });

  it('welds a realistic non-indexed cube without reporting it as modified', () => {
    const mesh = buildMesh(cubeTriangles);
    const { meshBuffers, report } = repairMesh(mesh);

    expect(report.wasModified).toBe(false); // critical regression guard: welding alone is not a repair
    expect(report.verticesWelded).toBeGreaterThan(0); // confirms welding actually ran (36 -> 8 vertices)
    expect(meshBuffers.triangleCount).toBe(12);
    expect(meshBuffers.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
  });

  it('caps a hole whose own bordering face was also inconsistently wound', () => {
    // Regression case: a naive implementation records each boundary edge's direction once, before
    // winding gets fixed — if the hole's own neighboring face is the one that gets flipped, that
    // recorded direction goes stale and the loop walk (or the resulting cap's winding) breaks.
    const flippedFaceOppositeB: [Point, Point, Point] = [A, C, D]; // two vertices swapped
    const mesh = buildMesh([flippedFaceOppositeB, faceOppositeC, faceOppositeD]); // face opposite A dropped
    const { meshBuffers, report } = repairMesh(mesh);

    expect(report.facesFlipped).toBe(1);
    expect(report.holesFilled).toBe(1);
    expect(report.holesRemaining).toBe(0);
    expect(meshBuffers.triangleCount).toBe(4);
    expect(isConsistentlyOriented(meshBuffers)).toBe(true);
  });

  it('caps a 4-vertex square hole left by a missing cube face via ear-clipping', () => {
    const withoutTop = cubeTriangles.slice(2); // drop the top face's 2 triangles
    const mesh = buildMesh(withoutTop);
    const { meshBuffers, report } = repairMesh(mesh);

    expect(report.holesFilled).toBe(1);
    expect(report.holesRemaining).toBe(0);
    expect(meshBuffers.triangleCount).toBe(10 + 2);
    expect(isClosedManifold(meshBuffers)).toBe(true);
    expect(isConsistentlyOriented(meshBuffers)).toBe(true);
  });
});
