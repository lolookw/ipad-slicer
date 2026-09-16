import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plate, type PlateObject } from '../../app/stores/plate';
import type { TransformToolbarLabels } from './TransformToolbar';
import { PlateObjectToolbar } from './ViewerToolbarContainer';

const labels: TransformToolbarLabels = {
  toolbar: 'Object tools', deselect: 'Deselect', layFlat: 'Lay flat', rotateX: 'Rotate X', rotateY: 'Rotate Y',
  scale: 'Scale', duplicate: 'Duplicate', delete: 'Delete', reset: 'Reset', title: 'Object size', close: 'Close', size: 'Largest dimension',
  unit: 'Size unit', suspicious: 'Suspicious size', multiply25_4: '×25.4', multiply1000: '×1000', divide10: '÷10', keep: 'Keep as entered', resize: 'Resize',
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
afterEach(() => { cleanup(); plate.clear(); vi.restoreAllMocks(); });

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
