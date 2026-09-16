import { beforeEach, describe, expect, it } from 'vitest';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { getMeshBuffers, releaseMesh } from './geometry-cache';
import type { MeshBuffers } from './geometry-cache';
import { importFileToPlate, validateImportBudget } from './plate-import';

const limits = { objects: 4, triangles: 100, previewMegabytes: 100 };
const mesh: MeshBuffers = { positions: new Float32Array(9), normals: new Float32Array(9), bounds: { min: [0, 0, 0], max: [10, 10, 10] }, triangleCount: 1 };

beforeEach(() => { plate.clear(); binaries.clear(); flow.hasModel.set(false); });

describe('plate import wiring', () => {
  it('enforces calibrated object and aggregate triangle limits', () => {
    expect(validateImportBudget(4, 4, 1, limits)).toContain('at most 4 objects');
    expect(validateImportBudget(1, 90, 11, limits)).toContain('at most 100 triangles');
    expect(validateImportBudget(1, 90, 10, limits)).toBeUndefined();
  });

  it('adds a valid STL to the plate and retains CPU arrays plus the source blob', async () => {
    const file = new File(['solid'], 'cube.stl');
    const result = await importFileToPlate(file, limits, async () => ({ ok: true, meshBuffers: mesh }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(plate.state.objects).toHaveLength(1);
    expect(plate.state.selectedId).toBe(result.id);
    expect(getMeshBuffers(result.id)?.positions).toBe(mesh.positions);
    expect(binaries.getMesh(result.id)).toBe(file);
    expect(flow.hasModel.get()).toBe(true);
    releaseMesh(result.id); binaries.release(result.id);
  });

  it('preserves every existing object when parsing or budget validation fails', async () => {
    const first = await importFileToPlate(new File(['ok'], 'first.stl'), limits, async () => ({ ok: true, meshBuffers: mesh }));
    expect(first.ok).toBe(true);
    const snapshot = JSON.stringify(plate.state.objects);
    const invalid = await importFileToPlate(new File(['bad'], 'bad.stl'), limits, async () => ({ ok: false, error: 'Invalid STL' }));
    const oversized = await importFileToPlate(new File(['large'], 'large.stl'), { ...limits, triangles: 1 }, async () => ({ ok: true, meshBuffers: mesh }));
    expect(invalid).toEqual({ ok: false, error: 'Invalid STL' });
    expect(oversized.ok).toBe(false);
    expect(JSON.stringify(plate.state.objects)).toBe(snapshot);
    if (first.ok) { releaseMesh(first.id); binaries.release(first.id); }
  });
});
