import { expect, it } from 'vitest';
import { WorkerMeshCache } from './mesh-cache';

it('rejects stale generations and missing mesh ids', async () => {
  const cache = new WorkerMeshCache();
  cache.put(2, 'present', new Blob(['mesh']));
  await expect(cache.read(1, ['present'])).rejects.toThrow('Stale mesh generation 1; expected 2');
  await expect(cache.read(2, ['missing'])).rejects.toThrow('Missing mesh missing');
});

it('clears stale entries on a new generation and releases current entries', async () => {
  const cache = new WorkerMeshCache();
  cache.put(1, 'old', new Blob(['old']));
  cache.put(2, 'current', new Blob(['current']));
  expect(cache.size).toBe(1);
  await expect(cache.read(2, ['old'])).rejects.toThrow('Missing mesh old');
  cache.release(2, 'current');
  expect(cache.size).toBe(0);
});
