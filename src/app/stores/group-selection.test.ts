import { beforeEach, describe, expect, it } from 'vitest';
import { IDENTITY_TRANSFORM, type LocalBounds } from '../../viewer/transforms';
import { plate, type PlateObject } from './plate';
import {
  clearGroupSelection, groupSelectedIds, groupSelectMode, selectAll, setGroupSelectMode, setGroupSelection, toggleGroupSelection,
} from './group-selection';

const BOUNDS: LocalBounds = { min: [0, 0, 0], max: [10, 10, 10] };
const object = (id: string): PlateObject => ({ id, name: id, triangleCount: 12, bounds: BOUNDS, transform: IDENTITY_TRANSFORM });

beforeEach(() => { plate.clear(); setGroupSelectMode(false); });

describe('group selection: mode off', () => {
  it('mirrors the plate primary selection with no manual sync needed', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    expect(groupSelectMode()).toBe(false);
    expect([...groupSelectedIds()]).toEqual(['b']); // addObject selects the newly added object

    plate.select('a');
    expect([...groupSelectedIds()]).toEqual(['a']);

    plate.select(undefined);
    expect([...groupSelectedIds()]).toEqual([]);
  });
});

describe('setGroupSelectMode', () => {
  it('starts the group fresh at just the primary when turning on', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.select('a');

    setGroupSelectMode(true);

    expect(groupSelectMode()).toBe(true);
    expect([...groupSelectedIds()]).toEqual(['a']);
  });

  it('collapses the group back to just the primary when turning off', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.select(undefined);
    setGroupSelectMode(true);
    toggleGroupSelection('a');
    toggleGroupSelection('b');
    expect(groupSelectedIds().size).toBe(2);

    setGroupSelectMode(false);

    expect([...groupSelectedIds()]).toEqual([plate.state.selectedId]);
  });
});

describe('toggleGroupSelection', () => {
  beforeEach(() => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.addObject(object('c'));
    plate.select(undefined); // start every test from an empty group, not the "c" auto-included by setGroupSelectMode below
    setGroupSelectMode(true);
  });

  it('adds an id and makes it primary', () => {
    toggleGroupSelection('a');
    expect(groupSelectedIds().has('a')).toBe(true);
    expect(plate.state.selectedId).toBe('a');

    toggleGroupSelection('b');
    expect([...groupSelectedIds()].sort()).toEqual(['a', 'b']);
    expect(plate.state.selectedId).toBe('b'); // most recently toggled is primary
  });

  it('removing a non-primary member leaves the primary untouched', () => {
    toggleGroupSelection('a');
    toggleGroupSelection('b');
    toggleGroupSelection('a'); // remove 'a', which is not primary ('b' is)

    expect([...groupSelectedIds()]).toEqual(['b']);
    expect(plate.state.selectedId).toBe('b');
  });

  it('removing the primary falls back to the next-most-recently-toggled surviving member', () => {
    toggleGroupSelection('a');
    toggleGroupSelection('b');
    toggleGroupSelection('c');
    expect(plate.state.selectedId).toBe('c');

    toggleGroupSelection('c'); // remove the current primary

    expect(plate.state.selectedId).toBe('b');
    expect([...groupSelectedIds()].sort()).toEqual(['a', 'b']);
  });

  it('removing the last member leaves nothing selected', () => {
    toggleGroupSelection('a');
    toggleGroupSelection('a');

    expect(groupSelectedIds().size).toBe(0);
    expect(plate.state.selectedId).toBeUndefined();
  });
});

describe('clearGroupSelection', () => {
  it('resets the raw set to just the current primary', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    setGroupSelectMode(true);
    toggleGroupSelection('a');
    toggleGroupSelection('b');

    clearGroupSelection();

    expect([...groupSelectedIds()]).toEqual([plate.state.selectedId]);
  });
});

describe('setGroupSelection', () => {
  it('replaces the group outright without touching the primary', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.addObject(object('c'));
    plate.select('a');
    setGroupSelectMode(true);

    setGroupSelection(['b', 'c']);

    expect([...groupSelectedIds()].sort()).toEqual(['b', 'c']);
    expect(plate.state.selectedId).toBe('a');
  });
});

describe('selectAll', () => {
  it('selects every object on the plate', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.addObject(object('c'));
    setGroupSelectMode(true);
    toggleGroupSelection('a'); // some pre-existing partial selection

    selectAll();

    expect([...groupSelectedIds()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps the current primary if it is still on the plate', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.select('a');
    setGroupSelectMode(true);

    selectAll();

    expect(plate.state.selectedId).toBe('a');
  });

  it('picks the last object as primary when nothing was selected', () => {
    plate.addObject(object('a'));
    plate.addObject(object('b'));
    plate.select(undefined);
    setGroupSelectMode(true);

    selectAll();

    expect(plate.state.selectedId).toBe('b');
  });

  it('is a no-op on an empty plate', () => {
    selectAll();
    expect(groupSelectedIds().size).toBe(0);
  });
});
