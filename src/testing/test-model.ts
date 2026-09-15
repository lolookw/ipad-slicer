export const TEST_MODEL_SIZES_MB = [1, 10, 20, 50] as const;
export function binaryStlByteLength(triangles: number): number { return 84 + 50 * triangles; }
export function trianglesForBytes(targetBytes: number): number {
  return Math.max(12, Math.floor((targetBytes - 84) / 50));
}

export function generateTestStl(targetBytes: number, options: { centerX?: number; centerY?: number; radius?: number } = {}): ArrayBuffer {
  const { centerX = 110, centerY = 110, radius = 25 } = options;
  const target = trianglesForBytes(targetBytes);
  let rings = 2, segments = 6, error = Infinity;
  // Even latitude divisions include the equator; keep cells reasonably proportioned.
  for (let r = 2; r <= Math.max(2, Math.ceil(Math.sqrt(target))); r += 2) {
    const s = Math.max(3, Math.round(target / (2 * (r - 1))));
    const delta = Math.abs(2 * s * (r - 1) - target);
    if (s >= r && s <= 4 * r && delta < error) {
      rings = r; segments = s; error = delta;
    }
  }
  const count = 2 * segments * (rings - 1);
  const buffer = new ArrayBuffer(binaryStlByteLength(count));
  const view = new DataView(buffer);
  const header = 'ipad-slicer test sphere';
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, count, true);
  let offset = 84;
  function vertex(r: number, s: number, at: number) {
    const pole = r === 0 || r === rings;
    const theta = Math.PI * r / rings, phi = 2 * Math.PI * (s % segments) / segments;
    const radial = pole ? 0 : radius * Math.sin(theta);
    view.setFloat32(at, centerX + radial * Math.cos(phi), true);
    view.setFloat32(at + 4, centerY + radial * Math.sin(phi), true);
    view.setFloat32(at + 8, r === rings ? 0 : radius * (1 + Math.cos(theta)), true);
  }
  function triangle(ar: number, as: number, br: number, bs: number, cr: number, cs: number) {
    vertex(ar, as, offset + 12); vertex(br, bs, offset + 24); vertex(cr, cs, offset + 36);
    const ax = view.getFloat32(offset + 12, true), ay = view.getFloat32(offset + 16, true), az = view.getFloat32(offset + 20, true);
    const ux = view.getFloat32(offset + 24, true) - ax, uy = view.getFloat32(offset + 28, true) - ay, uz = view.getFloat32(offset + 32, true) - az;
    const vx = view.getFloat32(offset + 36, true) - ax, vy = view.getFloat32(offset + 40, true) - ay, vz = view.getFloat32(offset + 44, true) - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    view.setFloat32(offset, nx / length, true);
    view.setFloat32(offset + 4, ny / length, true);
    view.setFloat32(offset + 8, nz / length, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      if (r > 0) triangle(r, s, r + 1, s, r, s + 1);
      if (r < rings - 1) triangle(r, s + 1, r + 1, s, r + 1, s + 1);
    }
  }
  return buffer;
}
