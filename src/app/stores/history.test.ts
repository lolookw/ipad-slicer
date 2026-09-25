import { beforeEach, describe, expect, it } from 'vitest';
import { IDENTITY_TRANSFORM, type LocalBounds } from '../../viewer/transforms';
import { clearMeshCache, getMeshBuffers, putMeshBuffers, type MeshBuffers } from '../../viewer/geometry-cache';
import { binaries } from './index';
import { plate, type PlateObject } from './plate';
import { beginTransaction, canRedo, canUndo, clear, record, recordAsync, redo, undo } from './history';

const BOUNDS: LocalBounds = { min: [0, 0, 0], max: [10, 10, 10] };
const object = (id: string, overrides: Partial<PlateObject> = {}): PlateObject =>
  ({ id, name: id, triangleCount: 12, bounds: BOUNDS, transform: IDENTITY_TRANSFORM, ...overrides });
const meshBuffers = (): MeshBuffers => ({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array(9), bounds: BOUNDS, triangleCount: 1 });

beforeEach(() => { plate.clear(); clearMeshCache(); binaries.clear(); clear(); });

describe('record() — one history entry per mutation', () => {
  it('is a no-op with nothing recorded yet', () => {
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
    undo(); // must not throw
    redo();
    expect(plate.state.objects).toEqual([]);
  });

  it('undo reverts exactly the change record() wrapped, redo re-applies it', () => {
    plate.addObject(object('a'));
    record(() => plate.rotate90('a', 'x'));
    const rotated = [...plate.state.objects[0]!.transform.rotation];
    expect(canUndo()).toBe(true);

    undo();
    expect(plate.state.objects[0]!.transform.rotation).toEqual([0, 0, 0]);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);

    redo();
    expect(plate.state.objects[0]!.transform.rotation).toEqual(rotated);
    expect(canRedo()).toBe(false);
  });

  it('restores selectedId as part of the snapshot', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.select('a');
    record(() => plate.removeObject('a')); // removeObject auto-selects the last remaining object ('b')
    expect(plate.state.selectedId).toBe('b');

    undo();
    expect(plate.state.selectedId).toBe('a');
    expect(plate.state.objects.map(o => o.id)).toEqual(['a', 'b']);
  });

  it('a new recorded action clears the redo stack', () => {
    plate.addObject(object('a'));
    record(() => plate.rotate90('a', 'x'));
    undo();
    expect(canRedo()).toBe(true);

    record(() => plate.rotate90('a', 'y'));
    expect(canRedo()).toBe(false);
  });

  it('a wrapped call that changes nothing (id not found) pushes no entry', () => {
    plate.addObject(object('a'));
    record(() => plate.rotate90('missing', 'x'));
    expect(canUndo()).toBe(false);
  });

  it('a selection-only change (plate.select, not wrapped by record) is never recorded', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.select('a');
    plate.select('b');
    expect(canUndo()).toBe(false);
  });

  it('undo after duplicate removes exactly the duplicate, keeping the original', () => {
    plate.addObject(object('a'));
    record(() => plate.duplicateObject('a', 'a-copy'));
    expect(plate.state.objects.map(o => o.id)).toEqual(['a', 'a-copy']);

    undo();
    expect(plate.state.objects.map(o => o.id)).toEqual(['a']);
  });

  it('recordAsync captures every mutation made during the awaited work as one entry', async () => {
    await recordAsync(async () => {
      plate.addObject(object('a'));
      await Promise.resolve();
      plate.addObject(object('b'));
    });
    expect(plate.state.objects.map(o => o.id)).toEqual(['a', 'b']);
    expect(canUndo()).toBe(true);

    undo();
    expect(plate.state.objects).toEqual([]);
    expect(canRedo()).toBe(true);
  });
});

describe('beginTransaction() — brackets a multi-step interaction (e.g. a gizmo drag) into one entry', () => {
  it('commit() after several intermediate mutations records only the start and end state', () => {
    plate.addObject(object('a'));
    const tx = beginTransaction();
    plate.updateTransform('a', { ...IDENTITY_TRANSFORM, position: [1, 0, 0] }, { dropToBed: false });
    plate.updateTransform('a', { ...IDENTITY_TRANSFORM, position: [5, 0, 0] }, { dropToBed: false });
    plate.updateTransform('a', { ...IDENTITY_TRANSFORM, position: [9, 0, 0] }, { dropToBed: false });
    tx.commit();

    expect(canUndo()).toBe(true);
    undo();
    // Undo jumps straight back to the pre-drag position, not one of the intermediate frames.
    expect(plate.state.objects[0]!.transform.position).toEqual([0, 0, 0]);
    redo();
    expect(plate.state.objects[0]!.transform.position).toEqual([9, 0, 0]);
  });

  it('discard() never records, even if the transaction mutated the plate', () => {
    plate.addObject(object('a'));
    const tx = beginTransaction();
    plate.updateTransform('a', { ...IDENTITY_TRANSFORM, position: [5, 0, 0] }, { dropToBed: false });
    tx.discard();

    expect(canUndo()).toBe(false);
    expect(plate.state.objects[0]!.transform.position).toEqual([5, 0, 0]); // discard does not itself revert the live state
  });
});

describe('the delete-then-undo geometry hazard', () => {
  // Mirrors what ViewerWorkspace.tsx's reactive sync() effect really does on every store change: it
  // calls releaseMesh(id) for any id that disappeared from plate.state.objects. That effect only runs
  // inside a mounted component, so this test drives the same release call directly to prove
  // history.ts's own mechanism is correct in isolation; tests/e2e/shell.spec.ts proves the full,
  // actually-wired reactive path end-to-end (real render, real pick).
  it('undo re-registers geometry-cache and the source Blob before the plate record reappears', () => {
    const buffers = meshBuffers();
    const blob = new Blob(['stl-bytes']);
    putMeshBuffers('a', buffers);
    binaries.putMesh('a', blob);
    plate.addObject(object('a'));

    record(() => plate.removeObject('a'));
    // Simulate ViewerWorkspace.tsx's reactive release, which fires the instant 'a' left the store.
    clearMeshCache();
    binaries.clear();
    expect(getMeshBuffers('a')).toBeUndefined();
    expect(binaries.getMesh('a')).toBeUndefined();

    undo();

    expect(plate.state.objects.map(o => o.id)).toEqual(['a']);
    expect(getMeshBuffers('a')).toBe(buffers); // same reference, never copied — mirrors duplicateMeshBuffers
    expect(binaries.getMesh('a')).toBe(blob);
  });

  it('does not touch geometry-cache when the object never lost it in the first place', () => {
    const buffers = meshBuffers();
    putMeshBuffers('a', buffers);
    plate.addObject(object('a'));

    record(() => plate.removeObject('a'));
    // geometry-cache was NOT released this time (no reactive effect ran) — 'a' still has its buffers.
    undo();

    expect(getMeshBuffers('a')).toBe(buffers);
  });
});

describe('history depth cap', () => {
  it('never keeps more than 50 undo steps', () => {
    plate.addObject(object('a'));
    for (let i = 0; i < 60; i += 1) record(() => plate.rotate90('a', i % 2 === 0 ? 'x' : 'y'));

    let undone = 0;
    while (canUndo() && undone < 100) { undo(); undone += 1; }

    expect(undone).toBe(50);
  });
});
