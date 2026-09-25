import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMeshCache, duplicateMeshBuffers, getGeometry, getMeshBuffers, putMeshBuffers, releaseMesh, type MeshBuffers,
} from './geometry-cache';

const MESH: MeshBuffers = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  bounds: { min: [0, 0, 0], max: [1, 1, 0] },
  triangleCount: 1,
};

describe('duplicateMeshBuffers', () => {
  beforeEach(clearMeshCache);

  // Regression test: a duplicated object previously got a plate-store entry but no geometry
  // registered under its new id, so it never rendered and appeared to simply vanish.
  it('registers the new id with the same mesh data as the source', () => {
    putMeshBuffers('source', MESH);
    const ok = duplicateMeshBuffers('source', 'copy');

    expect(ok).toBe(true);
    expect(getMeshBuffers('copy')).toBe(MESH); // shared reference, no unnecessary copy of large typed arrays
    expect(getGeometry('copy')).toBeDefined();
  });

  it('returns false and registers nothing when the source has no buffers yet', () => {
    const ok = duplicateMeshBuffers('missing', 'copy');

    expect(ok).toBe(false);
    expect(getMeshBuffers('copy')).toBeUndefined();
  });

  it('releasing the duplicate does not affect the source (separate cached BufferGeometry per id)', () => {
    putMeshBuffers('source', MESH);
    duplicateMeshBuffers('source', 'copy');
    getGeometry('source'); // force both geometries to build before either is released
    getGeometry('copy');

    releaseMesh('copy');

    expect(getMeshBuffers('source')).toBe(MESH);
    expect(getGeometry('source')).toBeDefined();
    expect(getMeshBuffers('copy')).toBeUndefined();
  });
});
