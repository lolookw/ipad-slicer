import { Euler, Quaternion, Vector3 } from 'three';
import { objectCenter } from './drag-math';
import { dropToBed, transformedSize, type LocalBounds, type ObjectTransform } from './transforms';

/**
 * Auto orient: picks the rotation for a single selected object that is the best way to print it,
 * mirroring OrcaSlicer/PrusaSlicer's "optimize orientation" (src/libslic3r/SLA/Rotfinder.cpp,
 * verified against github.com/OrcaSlicer/OrcaSlicer @ 2026-09, still present upstream while
 * PrusaSlicer's own copy has moved/disappeared from its current tree). That implementation scores
 * three independent signals — face-area-weighted overhang (steep downward-facing area needing
 * support), floor/contact area (rewards a face resting flat on the bed) and bounding-box height —
 * and picks per-objective winners rather than one combined score. This module follows the same
 * three signals but, per this feature's own spec, combines them into ONE weighted score (see
 * WEIGHT_* below) rather than three separate optimizers: that combination is this project's own
 * heuristic, not a verified match to Orca's internals, which were not fetched (only Rotfinder.cpp's
 * summary was reviewed, not the exact optimizer/weights it no longer uses for a single result).
 *
 * All math here is pure (no DOM, no three.js Scene) so it is fully unit-testable and safe to run
 * off the main mesh-import path. It operates on the mesh's LOCAL, untransformed triangle soup —
 * the same buffers geometry-cache.ts keeps per object — never on a live Object3D.
 */

/** Non-indexed local (untransformed) triangle soup: 3 consecutive XYZ vertices per triangle, matching MeshBuffers.positions. */
export interface TriangleMesh { positions: Float32Array; triangleCount: number }

/** A candidate orientation's rotational score plus its resulting print height (mm), lower score is better. */
export interface OrientationScore { quaternion: Quaternion; score: number; heightMm: number; isCurrent: boolean }

export interface AutoOrientResult {
  transform: ObjectTransform;
  /** False when the winner is (within tolerance) the object's current rotation — nothing meaningfully improved. */
  changed: boolean;
}

const DEG2RAD = Math.PI / 180;

/** A face whose rotated normal points more than this far from +Z is treated as needing support (Orca/Prusa's own convention). */
const OVERHANG_ANGLE_THRESHOLD_RAD = 45 * DEG2RAD;
/** A rotated normal within this angle of straight down (-Z) is the face resting on the plate, not an overhang. */
const FOOTPRINT_ANGLE_TOLERANCE_RAD = 5 * DEG2RAD;
/** Two local face normals within this angle merge into one candidate/scoring cluster. */
const CLUSTER_ANGLE_TOLERANCE_RAD = 3 * DEG2RAD;
const CLUSTER_DOT_TOLERANCE = Math.cos(CLUSTER_ANGLE_TOLERANCE_RAD);

/**
 * Above this many triangles, scoring reads every Nth triangle instead of all of them, so a single
 * tap stays responsive on an iPad even for a dense import. This trades a small amount of scoring
 * accuracy (a skipped sliver face) for a bounded, predictable cost; tested with a synthetic mesh
 * well above the threshold in auto-orient.test.ts.
 */
export const MAX_SAMPLE_TRIANGLES = 200_000;

/**
 * Hard cap on distinct normal-direction clusters. Generous enough to capture every meaningfully
 * distinct face of a typical printable part (boxes, brackets, printer-catalog test parts, simple
 * mechanical shapes all have far fewer than this many faces), while bounding worst-case cost for a
 * highly tessellated organic/curved mesh, where every triangle would otherwise start a new cluster.
 * Triangles beyond the cap fold into their nearest existing cluster instead of being dropped, so
 * total surface area is always fully accounted for in scoring — only the direction grouping gets
 * coarser once the cap is hit.
 */
export const MAX_CLUSTERS = 96;

// Weights are named/commented per the feature spec, not magic numbers. Overhang dominates because
// avoiding support material/failed prints is the primary reason to auto-orient at all (this matches
// Orca/Prusa treating "least supports" as its own, primary objective). Footprint is next: a wider
// contact face means better bed adhesion and less chance of the print detaching mid-job. Height is
// the smallest weight — shorter prints are nice (time, wobble) but should not override a
// meaningfully better support outcome on their own.
const WEIGHT_OVERHANG = 1.0;
const WEIGHT_FOOTPRINT = 0.4;
const WEIGHT_HEIGHT = 0.2;

/** Two scores within this are "near-tied" — height, then "prefer no rotation", breaks the tie. */
const SCORE_TIE_EPSILON = 0.01;
/** Two heights within this (mm) are "the same" for tie-breaking purposes. */
const HEIGHT_TIE_EPSILON_MM = 0.05;

interface Cluster { normal: Vector3; area: number }

/**
 * Groups the mesh's (possibly subsampled) triangles by face-normal direction. Each triangle's
 * face normal/area is computed directly from its 3 vertices (a plain cross product), never from a
 * cached per-vertex normal attribute, so this is correct regardless of whether the source mesh's
 * normals are per-facet or smoothed. No true convex hull is computed (three.js has none in core and
 * this module intentionally adds no new dependency) — distinct face-normal directions stand in for
 * hull faces, which is exact for a mesh made of flat faces (the common case for printable/CAD parts)
 * and a reasonable approximation for curved/organic meshes.
 */
function buildClusters(mesh: TriangleMesh): { clusters: Cluster[]; totalArea: number } {
  const clusters: Cluster[] = [];
  let totalArea = 0;
  const step = Math.max(1, Math.floor(mesh.triangleCount / MAX_SAMPLE_TRIANGLES));
  const a = new Vector3(); const b = new Vector3(); const c = new Vector3(); const edge1 = new Vector3(); const edge2 = new Vector3();
  for (let triangle = 0; triangle < mesh.triangleCount; triangle += step) {
    const base = triangle * 9;
    a.set(mesh.positions[base]!, mesh.positions[base + 1]!, mesh.positions[base + 2]!);
    b.set(mesh.positions[base + 3]!, mesh.positions[base + 4]!, mesh.positions[base + 5]!);
    c.set(mesh.positions[base + 6]!, mesh.positions[base + 7]!, mesh.positions[base + 8]!);
    edge1.subVectors(b, a); edge2.subVectors(c, a);
    const cross = new Vector3().crossVectors(edge1, edge2);
    const length = cross.length();
    if (length < 1e-12) continue; // degenerate triangle, contributes no area/normal
    const area = length / 2;
    const normal = cross.divideScalar(length);
    totalArea += area;

    let best: Cluster | undefined; let bestDot = -Infinity;
    for (const cluster of clusters) {
      const dot = cluster.normal.dot(normal);
      if (dot > bestDot) { bestDot = dot; best = cluster; }
    }
    if (best && bestDot >= CLUSTER_DOT_TOLERANCE) {
      // Running weighted-average direction, then re-normalized, so a cluster's representative
      // normal converges toward the true face direction even if the first sample was a bit off.
      best.normal.multiplyScalar(best.area).addScaledVector(normal, area).normalize();
      best.area += area;
    } else if (clusters.length < MAX_CLUSTERS) {
      clusters.push({ normal: normal.clone(), area });
    } else if (best) {
      // Cap reached: fold into the nearest existing cluster regardless of tolerance so area is
      // never lost, only grouped more coarsely.
      best.normal.multiplyScalar(best.area).addScaledVector(normal, area).normalize();
      best.area += area;
    }
  }
  return { clusters, totalArea };
}

/** Score for one candidate rotation: lower is better. See the weight constants above for the rationale. */
function scoreQuaternion(
  quaternion: Quaternion, isCurrent: boolean, clusters: readonly Cluster[], totalArea: number,
  bounds: LocalBounds, referenceTransform: ObjectTransform, diagonalMm: number,
): OrientationScore {
  let overhangArea = 0;
  let footprintArea = 0;
  const rotated = new Vector3();
  for (const cluster of clusters) {
    rotated.copy(cluster.normal).applyQuaternion(quaternion);
    const angleFromUp = rotated.angleTo(UP);
    if (Math.PI - angleFromUp <= FOOTPRINT_ANGLE_TOLERANCE_RAD) footprintArea += cluster.area;
    else if (angleFromUp > OVERHANG_ANGLE_THRESHOLD_RAD) overhangArea += cluster.area;
  }
  const rotation = new Euler().setFromQuaternion(quaternion, 'XYZ');
  const heightMm = totalArea > 0
    ? transformedSize(bounds, { ...referenceTransform, position: [0, 0, 0], rotation: [rotation.x, rotation.y, rotation.z] })[2]
    : 0;
  const overhangRatio = totalArea > 0 ? overhangArea / totalArea : 0;
  const footprintRatio = totalArea > 0 ? footprintArea / totalArea : 0;
  const heightRatio = diagonalMm > 0 ? heightMm / diagonalMm : 0;
  const score = WEIGHT_OVERHANG * overhangRatio - WEIGHT_FOOTPRINT * footprintRatio + WEIGHT_HEIGHT * heightRatio;
  return { quaternion, score, heightMm, isCurrent };
}

const UP = new Vector3(0, 0, 1);
const DOWN = new Vector3(0, 0, -1);

/**
 * Picks the best rotation for `mesh`/`bounds` starting from `currentTransform`, and drops the
 * result back onto the plate (Z only — X/Y follow the same "rotate about the local origin, then
 * settle" convention `rotate90` already uses in transforms.ts, so this composes the same way the
 * existing Rotate 90° buttons do). Ties (including a fully symmetric primitive, e.g. a cube or a
 * sphere approximated by enough faces) resolve to the lowest height, then to no rotation at all.
 */
export function findBestOrientation(mesh: TriangleMesh, bounds: LocalBounds, currentTransform: ObjectTransform): AutoOrientResult {
  const { clusters, totalArea } = buildClusters(mesh);
  const diagonal = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
  const currentQuaternion = new Quaternion().setFromEuler(new Euler(...currentTransform.rotation, 'XYZ'));

  const candidates: OrientationScore[] = clusters.map((cluster) => {
    const quaternion = new Quaternion().setFromUnitVectors(cluster.normal, DOWN);
    return scoreQuaternion(quaternion, false, clusters, totalArea, bounds, currentTransform, diagonal);
  });
  candidates.push(scoreQuaternion(currentQuaternion, true, clusters, totalArea, bounds, currentTransform, diagonal));

  const bestScore = Math.min(...candidates.map((candidate) => candidate.score));
  const tied = candidates.filter((candidate) => candidate.score <= bestScore + SCORE_TIE_EPSILON);
  const lowestHeight = Math.min(...tied.map((candidate) => candidate.heightMm));
  const shortest = tied.filter((candidate) => candidate.heightMm <= lowestHeight + HEIGHT_TIE_EPSILON_MM);
  const winner = shortest.find((candidate) => candidate.isCurrent) ?? shortest[0]!;

  // Picking "current" reuses its exact original rotation triple (not a quaternion->Euler
  // round trip), so a no-op result is bit-for-bit the input, never a -0-tainted lookalike.
  const rotated: ObjectTransform = winner.isCurrent
    ? currentTransform
    : (() => {
      const rotation = new Euler().setFromQuaternion(winner.quaternion, 'XYZ');
      return { ...currentTransform, rotation: [rotation.x, rotation.y, rotation.z] as ObjectTransform['rotation'] };
    })();
  const seated = dropToBed(bounds, rotated);
  const changed = !winner.isCurrent && winner.quaternion.angleTo(currentQuaternion) > 1e-4;
  return { transform: seated, changed };
}

// --- Placement: keep the winning orientation from overlapping another object's existing footprint ---

export interface PlacementObject { bounds: LocalBounds; transform: ObjectTransform }
export interface BedFootprint { widthMm: number; depthMm: number }
export interface PlacementResult {
  transform: ObjectTransform;
  /** False when no fully free, in-bounds spot was found — `transform` is a best-effort centered placement. */
  freeSpotFound: boolean;
}

/** Minimum gap kept between two objects' AABB footprints — small, but enough that they never touch. */
const PLACEMENT_CLEARANCE_MM = 2;
/** Grid resolution for the outward search. Coarser than the 1mm move-snap: this only needs to find
 * *a* free spot, not the tightest possible packing, and a 220mm bed at this step is ~2k points — trivial for one tap. */
const PLACEMENT_GRID_STEP_MM = 5;

function worldFootprint(bounds: LocalBounds, transform: ObjectTransform): { minX: number; maxX: number; minY: number; maxY: number } {
  const center = objectCenter(bounds, transform);
  const [width, depth] = transformedSize(bounds, transform);
  return { minX: center.x - width / 2, maxX: center.x + width / 2, minY: center.y - depth / 2, maxY: center.y + depth / 2 };
}

function footprintsOverlap(a: ReturnType<typeof worldFootprint>, b: ReturnType<typeof worldFootprint>, clearance: number): boolean {
  return a.minX < b.maxX + clearance && a.maxX > b.minX - clearance && a.minY < b.maxY + clearance && a.maxY > b.minY - clearance;
}

function isWithinBed(footprint: ReturnType<typeof worldFootprint>, bed: BedFootprint): boolean {
  const halfWidth = bed.widthMm / 2; const halfDepth = bed.depthMm / 2;
  return footprint.minX >= -halfWidth && footprint.maxX <= halfWidth && footprint.minY >= -halfDepth && footprint.maxY <= halfDepth;
}

/**
 * If `target`'s current XY already clears every object in `others` (and stays on the bed), it is
 * kept unchanged (biasing toward wherever auto-orient's rotation happened to leave it). Otherwise
 * this scans a deterministic grid of candidate centers, sorted by distance from the plate center
 * (i.e. outward in increasing radius), and returns the first one that clears every other object and
 * the bed bounds. If none exists, it falls back to centering `target` on the plate and reports that
 * in `freeSpotFound: false` so the caller can surface a warning — `others` are never moved.
 */
export function resolveAutoOrientPlacement(target: PlacementObject, others: readonly PlacementObject[], bed: BedFootprint): PlacementResult {
  const otherFootprints = others.map((other) => worldFootprint(other.bounds, other.transform));
  const fits = (transform: ObjectTransform): boolean => {
    const footprint = worldFootprint(target.bounds, transform);
    return isWithinBed(footprint, bed) && otherFootprints.every((other) => !footprintsOverlap(footprint, other, PLACEMENT_CLEARANCE_MM));
  };

  if (fits(target.transform)) return { transform: target.transform, freeSpotFound: true };

  // Position is affine in (x, y) for a fixed rotation/scale/mirror, so the world-center offset at
  // position (0, 0) tells us exactly what position.xy produces any desired world center.
  const centerAtOrigin = objectCenter(target.bounds, { ...target.transform, position: [0, 0, target.transform.position[2]] });
  const halfWidth = bed.widthMm / 2; const halfDepth = bed.depthMm / 2;
  const candidates: [number, number][] = [];
  for (let y = -halfDepth; y <= halfDepth; y += PLACEMENT_GRID_STEP_MM) {
    for (let x = -halfWidth; x <= halfWidth; x += PLACEMENT_GRID_STEP_MM) candidates.push([x, y]);
  }
  candidates.sort(([ax, ay], [bx, by]) => Math.hypot(ax, ay) - Math.hypot(bx, by));

  for (const [centerX, centerY] of candidates) {
    const position: ObjectTransform['position'] = [centerX - centerAtOrigin.x, centerY - centerAtOrigin.y, target.transform.position[2]];
    const candidate: ObjectTransform = { ...target.transform, position };
    if (fits(candidate)) return { transform: candidate, freeSpotFound: true };
  }

  const centered: ObjectTransform = { ...target.transform, position: [-centerAtOrigin.x, -centerAtOrigin.y, target.transform.position[2]] };
  return { transform: centered, freeSpotFound: false };
}
