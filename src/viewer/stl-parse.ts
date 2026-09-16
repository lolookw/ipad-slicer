import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { MeshBuffers } from './geometry-cache';

export type ImportStlResult = { ok: true; meshBuffers: MeshBuffers } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The STL file could not be parsed.';
}

/** Parses STL bytes without browser or worker dependencies. */
export function parseStlBuffer(buffer: ArrayBuffer): ImportStlResult {
  try {
    if (buffer.byteLength < 5) throw new Error('The STL file is empty or too short.');

    const geometry = new STLLoader().parse(buffer);
    const position = geometry.getAttribute('position');
    if (!position || position.count === 0 || position.itemSize !== 3 || position.count % 3 !== 0)
      throw new Error('The STL file does not contain valid triangles.');

    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const normal = geometry.getAttribute('normal');
    if (!normal || normal.itemSize !== 3 || normal.count !== position.count)
      throw new Error('The STL file does not contain valid vertex normals.');

    const positions = position.array;
    const normals = normal.array;
    if (!(positions instanceof Float32Array) || !(normals instanceof Float32Array))
      throw new Error('The STL file produced unsupported mesh buffers.');
    if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite))
      throw new Error('The STL file contains invalid numeric values.');

    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    if (!boundingBox) throw new Error('The STL file bounds could not be computed.');

    return {
      ok: true,
      meshBuffers: {
        positions,
        normals,
        bounds: { min: boundingBox.min.toArray(), max: boundingBox.max.toArray() },
        triangleCount: positions.length / 9,
      },
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
