import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plate, type PlateObject } from '../../app/stores/plate';
import { clearMeshCache, putMeshBuffers } from '../geometry-cache';
import type { TransformToolbarLabels } from './TransformToolbar';
import { PlateObjectToolbar } from './ViewerToolbarContainer';
import { ViewPresets } from './ViewPresets';

/** A 30x2x40 box (non-indexed, outward-facing normals) — the same fin shape used to prove auto-orient's math in auto-orient.test.ts. */
function finMeshBuffers() {
  const vertices = [[0, 0, 0], [30, 0, 0], [30, 2, 0], [0, 2, 0], [0, 0, 40], [30, 0, 40], [30, 2, 40], [0, 2, 40]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const positions = new Float32Array(faces.length * 9);
  faces.forEach((face, faceIndex) => face.forEach((vertexIndex, i) => vertices[vertexIndex]!.forEach((value, axis) => {
    positions[faceIndex * 9 + i * 3 + axis] = value;
  })));
  return { positions, normals: new Float32Array(positions.length), bounds: { min: [0, 0, 0] as [number, number, number], max: [30, 2, 40] as [number, number, number] }, triangleCount: faces.length };
}

const labels: TransformToolbarLabels = {
  toolbar: 'Object tools', history: 'Undo history', mode: 'Transform mode', select: 'Select', move: 'Move', rotate: 'Rotate', snap: 'Snap',
  deselect: 'Deselect', layFlat: 'Lay flat', autoOrient: 'Auto orient', rotateX: 'Rotate X', rotateY: 'Rotate Y',
  scale: 'Scale', duplicate: 'Duplicate', delete: 'Delete', reset: 'Reset', undo: 'Undo', redo: 'Redo', title: 'Object size', close: 'Close', size: 'Largest dimension',
  unit: 'Size unit', suspicious: 'Suspicious size', multiply25_4: '×25.4', multiply1000: '×1000', divide10: '÷10', keep: 'Keep as entered', resize: 'Resize',
  editValues: 'Edit values', transformTitle: 'Object transform',
  positionHeading: 'Position (mm)', positionX: 'Position X', positionY: 'Position Y', positionZ: 'Position Z',
  rotationHeading: 'Rotation (°)', rotationX: 'Rotation X', rotationY: 'Rotation Y', rotationZ: 'Rotation Z',
  scaleHeading: 'Scale (%)', scaleX: 'Scale X', scaleY: 'Scale Y', scaleZ: 'Scale Z', scaleLink: 'Keep scale proportional',
  dimensionsHeading: 'Dimensions (mm)', dimensionX: 'Width (X)', dimensionY: 'Depth (Y)', dimensionZ: 'Height (Z)',
  resizeTransformSheet: 'Resize transform sheet',
};

const object = (id: string, side = 10): PlateObject => ({
  id, name: id, triangleCount: 12,
  bounds: { min: [0, 0, 0], max: [side, side, side] },
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false] },
});

const openScale = () => fireEvent.click(screen.getByRole('button', { name: 'Scale' }));
const sizeInput = () => screen.getByRole('spinbutton', { name: 'Largest dimension' }) as HTMLInputElement;
const commitSize = (value: number) => {
  fireEvent.input(sizeInput(), { target: { value: String(value) } });
  fireEvent.change(sizeInput(), { target: { value: String(value) } });
};

beforeEach(() => plate.clear());
afterEach(() => { cleanup(); plate.clear(); clearMeshCache(); vi.restoreAllMocks(); });

it('changes only the selected object when a numeric scale is committed', () => {
  plate.addObject(object('first'));
  plate.addObject(object('second'));
  plate.select('first');
  render(() => <PlateObjectToolbar labels={labels} />);

  openScale();
  commitSize(40);

  expect(plate.state.objects.find(item => item.id === 'first')!.transform.scale).toEqual([4, 4, 4]);
  expect(plate.state.objects.find(item => item.id === 'second')!.transform.scale).toEqual([1, 1, 1]);
});

it('changes the displayed unit without committing a transform', () => {
  plate.addObject(object('selected', 25.4));
  const before = [...plate.state.objects[0]!.transform.scale];
  const update = vi.spyOn(plate, 'updateTransform');
  render(() => <PlateObjectToolbar labels={labels} />);

  openScale();
  fireEvent.click(screen.getByRole('radio', { name: 'in' }));

  expect(sizeInput().value).toBe('1');
  expect(update).not.toHaveBeenCalled();
  expect(plate.state.objects[0]!.transform.scale).toEqual(before);
});

it('deselects the object and hides the toolbar when the deselect button is pressed', () => {
  plate.addObject(object('first'));
  render(() => <PlateObjectToolbar labels={labels} />);

  expect(screen.getByRole('toolbar', { name: 'Object tools' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Deselect' }));

  expect(plate.state.selectedId).toBeUndefined();
  expect(screen.queryByRole('toolbar', { name: 'Object tools' })).toBeNull();
});

it('offers a Snap toggle that is on by default and reports presses', () => {
  plate.addObject(object('first'));
  const onSnapToggle = vi.fn();
  render(() => <PlateObjectToolbar labels={labels} onSnapToggle={onSnapToggle} />);

  const snap = screen.getByRole('button', { name: 'Snap' });
  expect(snap.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(snap);
  expect(onSnapToggle).toHaveBeenCalledOnce();
});

it('reflects a disabled snap state and no longer shows axis-lock controls', () => {
  plate.addObject(object('first'));
  render(() => <PlateObjectToolbar labels={labels} snapEnabled={false} />);

  expect(screen.getByRole('button', { name: 'Snap' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByRole('group', { name: 'Axis lock' })).toBeNull();
  for (const name of ['Select', 'Move', 'Rotate', 'Lay flat', 'Auto orient', 'Rotate X', 'Rotate Y', 'Scale', 'Edit values', 'Duplicate', 'Delete', 'Reset', 'Deselect']) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
});

it('defaults the mode toolbar to Select and switches to Move/Rotate on click, one active at a time', () => {
  plate.addObject(object('first'));
  const onModeChange = vi.fn();
  render(() => <PlateObjectToolbar labels={labels} mode="select" onModeChange={onModeChange} />);

  expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Move' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'Rotate' }).getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(screen.getByRole('button', { name: 'Move' }));
  expect(onModeChange).toHaveBeenCalledWith('move');
});

it('auto-orients the selected object without touching an unselected one', () => {
  plate.addObject(object('first'));
  plate.addObject({ ...object('second'), transform: { ...object('second').transform, position: [40, 40, 0] } });
  plate.select('first');
  render(() => <PlateObjectToolbar labels={labels} />);

  const before = { ...plate.state.objects.find(item => item.id === 'second')!.transform };
  fireEvent.click(screen.getByRole('button', { name: 'Auto orient' }));

  // No cached mesh buffers in this unit test (geometry-cache is populated by the import pipeline,
  // out of scope here), so the handler's early-return guard is what this asserts: the unselected
  // object's transform is untouched either way.
  expect(plate.state.objects.find(item => item.id === 'second')!.transform).toEqual(before);
});

it('re-orients a standing-on-edge selected object and leaves an unselected one alone, once its mesh is loaded', () => {
  const fin = finMeshBuffers();
  plate.addObject({ ...object('first'), bounds: fin.bounds, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false] } });
  plate.addObject({ ...object('second'), transform: { ...object('second').transform, position: [60, 60, 0] } });
  putMeshBuffers('first', fin);
  plate.select('first');
  render(() => <PlateObjectToolbar labels={labels} />);
  const untouched = { ...plate.state.objects.find(item => item.id === 'second')!.transform };

  fireEvent.click(screen.getByRole('button', { name: 'Auto orient' }));

  const oriented = plate.state.objects.find(item => item.id === 'first')!;
  expect(oriented.transform.rotation).not.toEqual([0, 0, 0]);
  expect(plate.state.objects.find(item => item.id === 'second')!.transform).toEqual(untouched);
});

it('renders the camera view presets and reports the chosen command', () => {
  const onView = vi.fn();
  render(() => <ViewPresets labels={{ group: 'Camera view', fit: 'Fit', top: 'Top', front: 'Front', iso: 'Iso' }} onView={onView} />);

  expect(screen.getByRole('group', { name: 'Camera view' })).toBeTruthy();
  for (const [name, command] of [['Fit', 'fit'], ['Top', 'top'], ['Front', 'front'], ['Iso', 'iso']] as const) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onView).toHaveBeenLastCalledWith(command);
  }
});

describe.each([4, 2001])('when the committed largest dimension is %s mm', value => {
  it('offers corrective unit conversions', () => {
    plate.addObject(object('selected', 10));
    render(() => <PlateObjectToolbar labels={labels} />);
    openScale();

    commitSize(value);

    expect(screen.getByRole('status').textContent).toContain('Suspicious size');
    expect(screen.getByRole('button', { name: '×25.4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '×1000' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '÷10' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep as entered' })).toBeTruthy();
  });
});

it('does not suggest conversion for a normal-range size', () => {
  plate.addObject(object('selected'));
  render(() => <PlateObjectToolbar labels={labels} />);
  openScale();

  commitSize(20);

  expect(screen.queryByRole('status')).toBeNull();
});

it('uses the sheet-open size as the absolute 100 percent baseline', () => {
  plate.addObject(object('selected'));
  render(() => <PlateObjectToolbar labels={labels} />);
  openScale();
  fireEvent.click(screen.getByRole('radio', { name: '%' }));

  commitSize(250);
  commitSize(50);

  expect(plate.state.objects[0]!.transform.scale).toEqual([0.5, 0.5, 0.5]);
});

describe('the numeric Position/Rotation/Scale fields (TransformFields)', () => {
  const openTransformFields = () => fireEvent.click(screen.getByRole('button', { name: 'Edit values' }));
  const numberField = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement;
  const commit = (name: string, value: number) => fireEvent.change(numberField(name), { target: { value: String(value) } });

  it('moves the object to exactly the typed Position value without re-seating X/Y', () => {
    plate.addObject(object('a'));
    render(() => <PlateObjectToolbar labels={labels} />);
    openTransformFields();

    commit('Position X', 12.5);
    commit('Position Y', -3);

    expect(plate.state.objects[0]!.transform.position[0]).toBeCloseTo(12.5, 6);
    expect(plate.state.objects[0]!.transform.position[1]).toBeCloseTo(-3, 6);
  });

  it('never lets a typed Position Z go below the plate', () => {
    plate.addObject(object('a'));
    render(() => <PlateObjectToolbar labels={labels} />);
    openTransformFields();

    commit('Position Z', -50);

    expect(plate.state.objects[0]!.transform.position[2]).toBeCloseTo(0, 6);
  });

  it('sets an absolute Rotation value, not a delta compounded onto the previous one', () => {
    plate.addObject(object('a'));
    render(() => <PlateObjectToolbar labels={labels} />);
    openTransformFields();

    commit('Rotation X', 30);
    expect(plate.state.objects[0]!.transform.rotation[0]).toBeCloseTo(Math.PI / 6, 5);

    commit('Rotation X', 45);
    expect(plate.state.objects[0]!.transform.rotation[0]).toBeCloseTo(Math.PI / 4, 5);
  });

  it('rejects an invalid typed value and reverts the field instead of committing it', () => {
    plate.addObject(object('a'));
    render(() => <PlateObjectToolbar labels={labels} />);
    openTransformFields();
    const update = vi.spyOn(plate, 'updateTransform');

    commit('Rotation Y', NaN);

    expect(update).not.toHaveBeenCalled();
    expect(numberField('Rotation Y').value).toBe('0.0');
  });

  it('keeps X/Y/Z scale proportional while the link toggle is on, and independent once turned off', () => {
    plate.addObject(object('a'));
    render(() => <PlateObjectToolbar labels={labels} />);
    openTransformFields();

    commit('Scale X', 50);
    expect(plate.state.objects[0]!.transform.scale).toEqual([0.5, 0.5, 0.5]);

    fireEvent.click(screen.getByRole('button', { name: 'Keep scale proportional' }));
    commit('Scale Y', 25);
    expect(plate.state.objects[0]!.transform.scale).toEqual([0.5, 0.25, 0.5]);
  });

  it('reads back the same live Reset action already wired to the toolbar', () => {
    plate.addObject({ ...object('a'), transform: { position: [5, 5, 5], rotation: [0.1, 0.1, 0.1], scale: [2, 2, 2], mirror: [false, false, false] } });
    render(() => <PlateObjectToolbar labels={labels} />);
    openTransformFields();

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]!);

    expect(plate.state.objects[0]!.transform.scale).toEqual([1, 1, 1]);
    expect(plate.state.objects[0]!.transform.rotation).toEqual([0, 0, 0]);
  });

  it('shows read-only computed Dimensions that follow the current transform', () => {
    plate.addObject(object('a', 10));
    render(() => <PlateObjectToolbar labels={labels} />);
    openTransformFields();

    expect(numberField('Width (X)').value).toBe('10.00');
    expect(numberField('Width (X)').readOnly).toBe(true);

    commit('Scale X', 200);
    expect(numberField('Width (X)').value).toBe('20.00');
  });
});
