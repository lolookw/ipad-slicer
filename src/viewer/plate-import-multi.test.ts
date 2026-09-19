import { beforeEach, describe, expect, it } from 'vitest';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { releaseMesh } from './geometry-cache';
import type { MeshBuffers } from './geometry-cache';
import { importFileToPlate } from './plate-import';

const limits = { objects: 4, triangles: 100, previewMegabytes: 100 };
const mesh: MeshBuffers = { positions: new Float32Array(9), normals: new Float32Array(9), bounds: { min: [0, 0, 0], max: [10, 10, 10] }, triangleCount: 1 };

beforeEach(() => { plate.clear(); binaries.clear(); flow.hasModel.set(false); });

describe('plate import of multi-object files', () => {
  const object = (name?: string, extra = {}) => ({ name, meshBuffers: mesh, ...extra });
  const parsed = (objects: ReturnType<typeof object>[]) => async () => ({ ok: true as const, format: '3mf' as const, objects });
  const releaseAll = () => { for (const item of plate.state.objects) { releaseMesh(item.id); binaries.release(item.id); } };

  it('adds each 3MF object as its own plate entry with names, extruder and materials preserved', async () => {
    const materials = [{ name: 'Red', color: '#FF0000' }, { color: '#00FF00' }];
    const result = await importFileToPlate(new File(['3mf'], 'set.3mf'), limits, parsed([object('Lid', { extruder: 2, materials }), object(), object()]));
    expect(result.ok && result.ids).toHaveLength(3);
    expect(plate.state.objects.map(item => item.name)).toEqual(['Lid', 'set.3mf (2)', 'set.3mf (3)']);
    expect(plate.state.objects[0]!.extruder).toBe(2);
    expect(plate.state.objects[0]!.materials).toEqual(materials);
    expect(plate.state.objects[1]!.materials).toBeUndefined();
    const blob = binaries.getMesh(plate.state.objects[0]!.id);
    expect(blob?.type).toBe('model/stl');
    expect(blob?.size).toBe(84 + 50);
    expect(flow.hasModel.get()).toBe(true);
    releaseAll();
  });

  it('falls back to the file name for a single unnamed object', async () => {
    await importFileToPlate(new File(['3mf'], 'single.3mf'), limits, parsed([object()]));
    expect(plate.state.objects.map(item => item.name)).toEqual(['single.3mf']);
    releaseAll();
  });

  it('imports all-or-nothing when the object or triangle budget would be exceeded', async () => {
    const tooManyObjects = await importFileToPlate(new File(['3mf'], 'many.3mf'), { ...limits, objects: 2 }, parsed([object(), object(), object()]));
    expect(tooManyObjects).toEqual({ ok: false, error: { code: 'tier-limit-objects', values: { limit: 2 } } });
    const tooManyTriangles = await importFileToPlate(new File(['3mf'], 'dense.3mf'), { ...limits, triangles: 2 }, parsed([object(), object(), object()]));
    expect(tooManyTriangles.ok).toBe(false);
    expect(plate.state.objects).toHaveLength(0);
  });

  it('passes the triangle limit to the parser as an early guard', async () => {
    let received: number | undefined;
    await importFileToPlate(new File(['x'], 'a.3mf'), limits, async (_file, options) => {
      received = options?.maxTriangles;
      return { ok: false, error: { code: 'threemf-not-zip' } };
    });
    expect(received).toBe(100);
  });
});
