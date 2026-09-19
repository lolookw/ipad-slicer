import type { MeshBuffers } from './geometry-cache';

/** Encodes non-indexed mesh buffers as a binary STL, the source format the slicing engine consumes. */
export function encodeBinaryStl(mesh: MeshBuffers): Blob {
  const buffer = new ArrayBuffer(84 + mesh.triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, mesh.triangleCount, true);
  for (let triangle = 0; triangle < mesh.triangleCount; triangle++) {
    const offset = 84 + triangle * 50;
    for (let axis = 0; axis < 3; axis++) view.setFloat32(offset + axis * 4, mesh.normals[triangle * 9 + axis]!, true);
    for (let index = 0; index < 9; index++) view.setFloat32(offset + 12 + index * 4, mesh.positions[triangle * 9 + index]!, true);
  }
  return new Blob([buffer], { type: 'model/stl' });
}
