import { expect, it } from 'vitest';
import { binaryStlByteLength, generateTestStl, TEST_MODEL_SIZES_MB, trianglesForBytes } from './test-model';

it('exposes the ladder and byte arithmetic', () => {
  expect(TEST_MODEL_SIZES_MB).toEqual([1, 10, 20, 50]);
  expect(binaryStlByteLength(12)).toBe(684);
  expect(trianglesForBytes(0)).toBe(12);
  expect(trianglesForBytes(999)).toBe(18);
});

it.each([20_000, 1_000_000, 10_000_000])('writes a consistent, outward sphere near %i bytes', target => {
  const buffer = generateTestStl(target), view = new DataView(buffer);
  const count = view.getUint32(80, true);
  expect(new TextDecoder().decode(buffer.slice(0, 80))).toMatch(/^ipad-slicer test sphere/);
  expect(buffer.byteLength).toBe(binaryStlByteLength(count));
  expect(Math.abs(count / trianglesForBytes(target) - 1)).toBeLessThanOrEqual(0.05);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let maxNormalError = 0, minOutward = Infinity, attributes = 0;
  for (let offset = 84; offset < buffer.byteLength; offset += 50) {
    const n = [0, 4, 8].map(i => view.getFloat32(offset + i, true));
    maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(...n) - 1));
    let dot = 0;
    for (let axis = 0; axis < 3; axis++) {
      let sum = 0;
      for (let v = 0; v < 3; v++) {
        const value = view.getFloat32(offset + 12 + v * 12 + axis * 4, true);
        min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value);
        sum += value;
      }
      dot += n[axis]! * (sum / 3 - (axis === 2 ? 25 : 110));
    }
    minOutward = Math.min(minOutward, dot);
    attributes |= view.getUint16(offset + 48, true);
  }
  expect(maxNormalError).toBeLessThan(1e-6);
  expect(minOutward).toBeGreaterThan(0);
  expect(attributes).toBe(0);
  expect(min[0]).toBeGreaterThanOrEqual(85); expect(max[0]).toBeLessThanOrEqual(135);
  expect(min[1]).toBeGreaterThanOrEqual(85); expect(max[1]).toBeLessThanOrEqual(135);
  expect(min[2]).toBeCloseTo(0); expect(max[2]).toBeCloseTo(50);
});

it('shares every edge twice, with opposite winding, including seams and poles', () => {
  const view = new DataView(generateTestStl(20_000, { centerX: 40, centerY: 50, radius: 10 }));
  const edges = new Map<string, { count: number; balance: number }>();
  for (let offset = 84; offset < view.byteLength; offset += 50) {
    const vertices = [12, 24, 36].map(v => [0, 4, 8].map(a => view.getFloat32(offset + v + a, true)).join(','));
    for (let i = 0; i < 3; i++) {
      const a = vertices[i]!, b = vertices[(i + 1) % 3]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count++; edge.balance += a < b ? 1 : -1; edges.set(key, edge);
    }
  }
  expect([...edges.values()].every(e => e.count === 2 && e.balance === 0)).toBe(true);
});
