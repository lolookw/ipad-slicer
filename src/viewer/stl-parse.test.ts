import { describe, expect, it } from 'vitest';
import { importStlFile } from './mesh.worker';
import { parseStlBuffer } from './stl-parse';

function binaryStl(triangles: Array<{ normal: [number, number, number]; vertices: [number, number, number][] }>): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);

  triangles.forEach((triangle, triangleIndex) => {
    const offset = 84 + triangleIndex * 50;
    triangle.normal.forEach((value, index) => view.setFloat32(offset + index * 4, value, true));
    triangle.vertices.forEach((vertex, vertexIndex) => {
      vertex.forEach((value, axis) => view.setFloat32(offset + 12 + vertexIndex * 12 + axis * 4, value, true));
    });
  });

  return buffer;
}

describe('parseStlBuffer', () => {
  it('returns non-indexed render buffers and local bounds for binary STL triangles', () => {
    const result = parseStlBuffer(binaryStl([
      { normal: [0, 0, 1], vertices: [[-2, 1, 0], [3, 1, 0], [0, 4, 0]] },
      { normal: [1, 0, 0], vertices: [[1, -5, 2], [1, 2, 2], [1, 0, 7]] },
    ]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meshBuffers.triangleCount).toBe(2);
    expect(result.meshBuffers.positions).toHaveLength(18);
    expect(result.meshBuffers.normals).toHaveLength(18);
    expect(result.meshBuffers.bounds).toEqual({ min: [-2, -5, 0], max: [3, 4, 7] });
  });

  it('returns a clean error through the main-thread fallback for invalid STL bytes', async () => {
    const file = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File;
    const result = await importStlFile(file);

    expect(result).toEqual({ ok: false, error: expect.any(String) });
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});
