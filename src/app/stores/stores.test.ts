import { beforeEach, expect, it } from 'vitest';
import { binaries, flow, reachableSteps } from './index';
import { sliceInputFingerprint } from './result';

beforeEach(() => {
  flow.hasModel.set(false);
  flow.hasResult.set(false);
  binaries.clear();
});

it('includes mesh identity when detecting stale slice inputs', () => {
  const transform = { position: [0, 0, 0] };
  expect(sliceInputFingerprint({}, [{ id: 'mesh-a', transform }]))
    .not.toBe(sliceInputFingerprint({}, [{ id: 'mesh-b', transform }]));
});

it('unlocks steps only as the flow progresses', () => {
  expect(reachableSteps()).toEqual(['import', 'configure']);
  flow.hasModel.set(true);
  expect(reachableSteps()).toContain('preview');
  expect(reachableSteps()).not.toContain('save');
  flow.hasResult.set(true);
  expect(reachableSteps()).toContain('save');
});

it('keeps binaries outside the reactive graph and releases them together', () => {
  const mesh = new Blob([new Uint8Array([1, 2, 3])]);
  const gcode = new ArrayBuffer(8);
  binaries.putMesh('a', mesh);
  binaries.putResult('a', gcode);
  expect(binaries.getMesh('a')).toBe(mesh);
  expect(binaries.getResult('a')).toBe(gcode);
  expect(binaries.size).toEqual({ meshes: 1, results: 1 });

  binaries.release('a');
  expect(binaries.getMesh('a')).toBeUndefined();
  expect(binaries.getResult('a')).toBeUndefined();
  expect(binaries.size).toEqual({ meshes: 0, results: 0 });
});
