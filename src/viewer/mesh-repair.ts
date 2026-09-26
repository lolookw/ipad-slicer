import type { MeshBuffers } from './geometry-cache';
import type { LocalBounds } from './transforms';

/**
 * Automatic client-side mesh repair for imported STL/3MF triangle soup. The pinned slicing engine
 * is a black box with no repair/diagnostics API of its own, so this runs entirely on the parsed
 * `MeshBuffers` before the mesh reaches the engine or the viewer (see mesh.worker.ts's parseBuffer).
 */
export interface MeshRepairReport {
  trianglesRemoved: number;
  holesFilled: number;
  holesRemaining: number;
  facesFlipped: number;
  nonManifoldEdges: number;
  /** Internal bookkeeping ONLY — not a defect indicator. Every STL is non-indexed triangle soup,
   * so a perfectly healthy file will still "weld" thousands of vertices during analysis. Never
   * show this number to the user and never let it affect wasModified. */
  verticesWelded: number;
  /** True iff trianglesRemoved, holesFilled, or facesFlipped is > 0 — i.e. the output mesh is
   * actually different from the input. Deliberately excludes verticesWelded. */
  wasModified: boolean;
}

/**
 * Vertex-welding grid, in mm. STL coordinates are typically tens to hundreds of mm, so float32 ulp
 * noise at that scale is far below 1e-4; but 1e-4mm is still far below anything printable, so this
 * never merges genuinely distinct geometry — only the "same point, re-typed by every triangle that
 * touches it" duplication that non-indexed triangle soup always has.
 */
const WELD_GRID = 1e-4;

/**
 * A triangle is degenerate if its area, squared, is below this. In real (mm-scale) meshes a sliver
 * this small is invisible at print resolution and is always an export artifact, never intentional
 * geometry — so this only catches genuine slivers, never a small-but-real triangle.
 */
const MIN_AREA_SQUARED = 1e-9;

/**
 * Small loops (an export glitch — one missing triangle or quad) get capped; loops bigger than this
 * are reported instead of guessed at, since naive triangulation of a large, possibly non-planar
 * opening is more likely to make things worse than to help.
 */
const MAX_HOLE_VERTICES = 12;

interface Vec3 { x: number; y: number; z: number }
interface Vec2 { x: number; y: number }

function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function normalize(a: Vec3): Vec3 {
  const len = Math.sqrt(dot(a, a));
  return len > 0 ? { x: a.x / len, y: a.y / len, z: a.z / len } : { x: 0, y: 0, z: 0 };
}

/** One use of an undirected edge by a triangle, with the direction that triangle itself stored it in. */
interface EdgeUse {
  triangle: number;
  from: number;
  to: number;
  /** Whether this triangle stored the edge in ascending-vertex-index order. Only ever compared
   * between two uses of the SAME edge, so the arbitrary "ascending" reference cancels out: two uses
   * with equal `forward` stored the edge in the same direction relative to each other (inconsistent
   * winding); different `forward` means opposite directions (consistent winding). */
  forward: boolean;
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const sign = (p1: Vec2, p2: Vec2, p3: Vec2) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Triangulates one closed boundary loop (vertex indices into the shared position list, already
 * ordered by the boundary direction the owning triangles implied) via Newell's method for the
 * loop's average normal, then 2D ear-clipping in a basis built from that normal. The basis is
 * built so the projected polygon winds counter-clockwise, matching the loop's own outward
 * direction — so the returned triangles need no re-orientation.
 */
function triangulateLoop(loopVertexIndices: number[], vx: (index: number) => Vec3): number[][] {
  const n = loopVertexIndices.length;
  const points = loopVertexIndices.map(vx);

  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const cur = points[i]!, next = points[(i + 1) % n]!;
    nx += (cur.y - next.y) * (cur.z + next.z);
    ny += (cur.z - next.z) * (cur.x + next.x);
    nz += (cur.x - next.x) * (cur.y + next.y);
  }
  const normal = normalize({ x: nx, y: ny, z: nz });
  // A flat/collinear loop has no well-defined normal; fall back to an arbitrary axis rather than
  // producing NaNs — this only affects which way ear-clipping projects, not correctness elsewhere.
  const safeNormal = dot(normal, normal) > 0 ? normal : { x: 0, y: 0, z: 1 };
  const helper: Vec3 = Math.abs(safeNormal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = normalize(cross(helper, safeNormal));
  const v = cross(safeNormal, u); // (u, v, safeNormal) is right-handed: u × v === safeNormal.
  const origin = points[0]!;
  const projected: Vec2[] = points.map(p => { const d = sub(p, origin); return { x: dot(d, u), y: dot(d, v) }; });

  const remaining = Array.from({ length: n }, (_, i) => i);
  const triangles: number[][] = [];
  let guard = n * n + 8; // A simple polygon always finds an ear well before this; it's just a safety bound.
  while (remaining.length > 3 && guard-- > 0) {
    const m = remaining.length;
    let clipped = false;
    for (let k = 0; k < m; k++) {
      const iPrev = remaining[(k - 1 + m) % m]!;
      const iCur = remaining[k]!;
      const iNext = remaining[(k + 1) % m]!;
      const a = projected[iPrev]!, b = projected[iCur]!, c = projected[iNext]!;
      const turn = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (turn <= 0) continue; // reflex or collinear: cannot be an ear of a CCW polygon
      const containsOther = remaining.some(j => j !== iPrev && j !== iCur && j !== iNext && pointInTriangle(projected[j]!, a, b, c));
      if (containsOther) continue;
      triangles.push([loopVertexIndices[iPrev]!, loopVertexIndices[iCur]!, loopVertexIndices[iNext]!]);
      remaining.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // Self-intersecting/degenerate projection: stop and fan the remainder below.
  }
  if (remaining.length === 3) {
    triangles.push([loopVertexIndices[remaining[0]!]!, loopVertexIndices[remaining[1]!]!, loopVertexIndices[remaining[2]!]!]);
  } else if (remaining.length > 3) {
    // Ear-clipping stalled; fan from the first remaining vertex so the hole still closes instead of
    // staying open (the loop was already validated as small, so this is a rare, bounded fallback).
    for (let i = 1; i < remaining.length - 1; i++)
      triangles.push([loopVertexIndices[remaining[0]!]!, loopVertexIndices[remaining[i]!]!, loopVertexIndices[remaining[i + 1]!]!]);
  }
  return triangles;
}

export function repairMesh(mesh: MeshBuffers): { meshBuffers: MeshBuffers; report: MeshRepairReport } {
  const inputTriangleCount = mesh.triangleCount;
  const originalVertexCount = inputTriangleCount * 3;

  // --- Step 1: weld vertices onto a shared indexed vertex list ---
  const uniquePositions: number[] = []; // flat x,y,z per unique vertex
  const vertexKeyToIndex = new Map<string, number>();
  const indices = new Uint32Array(originalVertexCount);
  for (let v = 0; v < originalVertexCount; v++) {
    const x = mesh.positions[v * 3]!, y = mesh.positions[v * 3 + 1]!, z = mesh.positions[v * 3 + 2]!;
    const key = `${Math.round(x / WELD_GRID)}_${Math.round(y / WELD_GRID)}_${Math.round(z / WELD_GRID)}`;
    let index = vertexKeyToIndex.get(key);
    if (index === undefined) {
      index = uniquePositions.length / 3;
      uniquePositions.push(x, y, z);
      vertexKeyToIndex.set(key, index);
    }
    indices[v] = index;
  }
  const verticesWelded = originalVertexCount - uniquePositions.length / 3;
  const vx = (i: number): Vec3 => ({ x: uniquePositions[i * 3]!, y: uniquePositions[i * 3 + 1]!, z: uniquePositions[i * 3 + 2]! });

  // --- Step 2: drop degenerate triangles ---
  const triangles: number[][] = [];
  let trianglesRemoved = 0;
  for (let t = 0; t < inputTriangleCount; t++) {
    const i0 = indices[t * 3]!, i1 = indices[t * 3 + 1]!, i2 = indices[t * 3 + 2]!;
    if (i0 === i1 || i1 === i2 || i0 === i2) { trianglesRemoved++; continue; }
    const areaVector = cross(sub(vx(i1), vx(i0)), sub(vx(i2), vx(i0)));
    const areaSquared = dot(areaVector, areaVector) * 0.25; // area = 0.5*|cross|, so area^2 = 0.25*|cross|^2
    if (areaSquared < MIN_AREA_SQUARED) { trianglesRemoved++; continue; }
    triangles.push([i0, i1, i2]);
  }

  // --- Step 3: undirected edge-adjacency map over the remaining triangles ---
  const edgeMap = new Map<string, EdgeUse[]>();
  for (let t = 0; t < triangles.length; t++) {
    const tri = triangles[t]!;
    for (let slot = 0; slot < 3; slot++) {
      const from = tri[slot]!;
      const to = tri[(slot + 1) % 3]!;
      const key = from < to ? `${from}_${to}` : `${to}_${from}`;
      const use: EdgeUse = { triangle: t, from, to, forward: from < to };
      const list = edgeMap.get(key);
      if (list) list.push(use); else edgeMap.set(key, [use]);
    }
  }

  const nonManifoldVertices = new Set<number>();
  let nonManifoldEdges = 0;
  const adjacency: Array<Array<{ neighbor: number; sameDirection: boolean }>> = triangles.map(() => []);
  const boundaryEdges: EdgeUse[] = [];
  for (const uses of edgeMap.values()) {
    if (uses.length === 2) {
      const [first, second] = [uses[0]!, uses[1]!];
      const sameDirection = first.forward === second.forward;
      adjacency[first.triangle]!.push({ neighbor: second.triangle, sameDirection });
      adjacency[second.triangle]!.push({ neighbor: first.triangle, sameDirection });
    } else if (uses.length === 1) {
      boundaryEdges.push(uses[0]!);
    } else if (uses.length >= 3) {
      nonManifoldEdges++;
      for (const use of uses) { nonManifoldVertices.add(use.from); nonManifoldVertices.add(use.to); }
    }
  }

  // --- Step 4: fix inconsistent winding within each connected shell ---
  const flippedInStep4 = new Set<number>();
  const flipTriangle = (t: number) => { const tri = triangles[t]!; const tmp = tri[1]!; tri[1] = tri[2]!; tri[2] = tmp; };
  const visited = new Array<boolean>(triangles.length).fill(false);
  const currentlyFlipped = new Array<boolean>(triangles.length).fill(false);
  for (let start = 0; start < triangles.length; start++) {
    if (visited[start]) continue;
    const shellMembers: number[] = [];
    const queue: number[] = [start];
    visited[start] = true;
    let head = 0;
    while (head < queue.length) {
      const t = queue[head++]!;
      shellMembers.push(t);
      for (const edge of adjacency[t]!) {
        if (visited[edge.neighbor]) continue;
        // Consistent orientation needs the shared edge stored in OPPOSITE directions by the two
        // triangles; `sameDirection` (fixed at build time) XOR this triangle's current flip state
        // tells us whether the neighbor needs flipping to achieve that, relative to `t`.
        const needsFlip = edge.sameDirection !== currentlyFlipped[t]!;
        if (needsFlip) { flipTriangle(edge.neighbor); currentlyFlipped[edge.neighbor] = true; flippedInStep4.add(edge.neighbor); }
        visited[edge.neighbor] = true;
        queue.push(edge.neighbor);
      }
    }
    let signedVolumeX6 = 0;
    for (const t of shellMembers) {
      const tri = triangles[t]!;
      signedVolumeX6 += dot(vx(tri[0]!), cross(vx(tri[1]!), vx(tri[2]!)));
    }
    if (signedVolumeX6 < 0) {
      for (const t of shellMembers) {
        flipTriangle(t);
        if (flippedInStep4.has(t)) flippedInStep4.delete(t); else flippedInStep4.add(t);
      }
    }
  }
  const facesFlipped = flippedInStep4.size;

  // --- Step 5: fill small holes ---
  let holesFilled = 0;
  let holesRemaining = 0;
  const boundaryStart = new Map<number, EdgeUse[]>();
  for (const edge of boundaryEdges) {
    if (nonManifoldVertices.has(edge.from) || nonManifoldVertices.has(edge.to)) continue;
    const list = boundaryStart.get(edge.from);
    if (list) list.push(edge); else boundaryStart.set(edge.from, [edge]);
  }
  const usedBoundaryEdge = new Set<EdgeUse>();
  for (const startEdge of boundaryEdges) {
    if (usedBoundaryEdge.has(startEdge)) continue;
    if (nonManifoldVertices.has(startEdge.from) || nonManifoldVertices.has(startEdge.to)) continue;
    const startVertex = startEdge.from;
    const loop: number[] = [startVertex];
    usedBoundaryEdge.add(startEdge);
    let current = startEdge.to;
    let closed = false;
    const guardLimit = boundaryEdges.length + 1;
    let steps = 0;
    while (current !== startVertex) {
      if (steps++ > guardLimit || loop.includes(current)) break; // dead end or revisit: abandon
      const next = boundaryStart.get(current)?.find(candidate => !usedBoundaryEdge.has(candidate));
      if (!next) break; // dead end: abandon
      usedBoundaryEdge.add(next);
      loop.push(current);
      current = next.to;
    }
    if (current === startVertex && loop.length >= 3) closed = true;
    if (!closed) continue; // don't count or fill an unclosable loop

    if (loop.length > MAX_HOLE_VERTICES) { holesRemaining++; continue; }
    for (const tri of triangulateLoop(loop, vx)) triangles.push(tri);
    holesFilled++;
  }

  // --- Step 6 + 7: recompute flat per-triangle normals and de-index to non-indexed triangle soup ---
  const finalTriangleCount = triangles.length;
  const positions = new Float32Array(finalTriangleCount * 9);
  const normals = new Float32Array(finalTriangleCount * 9);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let t = 0; t < finalTriangleCount; t++) {
    const tri = triangles[t]!;
    const a = vx(tri[0]!), b = vx(tri[1]!), c = vx(tri[2]!);
    const faceNormal = normalize(cross(sub(b, a), sub(c, a)));
    const base = t * 9;
    positions[base] = a.x; positions[base + 1] = a.y; positions[base + 2] = a.z;
    positions[base + 3] = b.x; positions[base + 4] = b.y; positions[base + 5] = b.z;
    positions[base + 6] = c.x; positions[base + 7] = c.y; positions[base + 8] = c.z;
    for (let k = 0; k < 3; k++) { normals[base + k * 3] = faceNormal.x; normals[base + k * 3 + 1] = faceNormal.y; normals[base + k * 3 + 2] = faceNormal.z; }
    for (const p of [a, b, c]) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; if (p.z > maxZ) maxZ = p.z;
    }
  }
  const bounds: LocalBounds = finalTriangleCount > 0 ? { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] } : { min: [0, 0, 0], max: [0, 0, 0] };

  const report: MeshRepairReport = {
    trianglesRemoved, holesFilled, holesRemaining, facesFlipped, nonManifoldEdges, verticesWelded,
    wasModified: trianglesRemoved > 0 || holesFilled > 0 || facesFlipped > 0,
  };
  return { meshBuffers: { positions, normals, bounds, triangleCount: finalTriangleCount }, report };
}
