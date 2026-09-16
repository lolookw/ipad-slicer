import { BufferAttribute, BufferGeometry } from 'three';
import type { LocalBounds } from './transforms';

/**
 * Parsed mesh buffers, keyed by plate object id. Module-level Map, NOT a Solid store: these are
 * large typed arrays and (once built) three.js BufferGeometry instances, which a store proxy
 * would either break or deep-copy. task 6.6 keeps entries here past slice time so the toolpath
 * preview (PR 6) can reuse the same buffers without re-parsing the source STL.
 */
export interface MeshBuffers { positions: Float32Array; normals: Float32Array; bounds: LocalBounds; triangleCount: number }

const buffers = new Map<string, MeshBuffers>();
const geometries = new Map<string, BufferGeometry>();

export function putMeshBuffers(id: string, mesh: MeshBuffers): void {
  buffers.set(id, mesh);
  geometries.get(id)?.dispose();
  geometries.delete(id);
}

export function getMeshBuffers(id: string): MeshBuffers | undefined {
  return buffers.get(id);
}

/** Lazily builds (and caches) the renderable BufferGeometry for an id. Non-indexed, per design. */
export function getGeometry(id: string): BufferGeometry | undefined {
  const cached = geometries.get(id);
  if (cached) return cached;
  const mesh = buffers.get(id);
  if (!mesh) return undefined;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometries.set(id, geometry);
  return geometry;
}

export function releaseMesh(id: string): void {
  geometries.get(id)?.dispose();
  geometries.delete(id);
  buffers.delete(id);
}

export function clearMeshCache(): void {
  for (const geometry of geometries.values()) geometry.dispose();
  geometries.clear();
  buffers.clear();
}
