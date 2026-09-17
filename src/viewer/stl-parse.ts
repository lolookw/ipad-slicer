import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { MeshBuffers } from './geometry-cache';
import type { CodedError, ErrorCode } from '../i18n/en';

export type ImportStlResult = { ok: true; meshBuffers: MeshBuffers } | { ok: false; error: CodedError };

class StlError extends Error { constructor(readonly code: ErrorCode) { super(code); } }

/** Parses STL bytes without browser or worker dependencies. */
export function parseStlBuffer(buffer: ArrayBuffer): ImportStlResult {
  try {
    if (buffer.byteLength < 5) throw new StlError('stl-empty');

    const geometry = new STLLoader().parse(buffer);
    const position = geometry.getAttribute('position');
    if (!position || position.count === 0 || position.itemSize !== 3 || position.count % 3 !== 0)
      throw new StlError('stl-no-triangles');

    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const normal = geometry.getAttribute('normal');
    if (!normal || normal.itemSize !== 3 || normal.count !== position.count)
      throw new StlError('stl-invalid-normals');

    const positions = position.array;
    const normals = normal.array;
    if (!(positions instanceof Float32Array) || !(normals instanceof Float32Array))
      throw new StlError('stl-unsupported-buffers');
    if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite))
      throw new StlError('stl-invalid-numbers');

    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    if (!boundingBox) throw new StlError('stl-invalid-bounds');

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
    return { ok: false, error: { code: error instanceof StlError ? error.code : 'stl-invalid-format' } };
  }
}
