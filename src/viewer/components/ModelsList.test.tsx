import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlateObject } from '../../app/stores/plate';
import { ModelsList, type ModelsListLabels } from './ModelsList';

const labels: ModelsListLabels = {
  hide: name => `Hide ${name}`, show: name => `Show ${name}`, menu: name => `More actions for ${name}`,
  duplicate: name => `Duplicate ${name}`, delete: name => `Delete ${name}`, rename: name => `Rename ${name}`, renamePrompt: 'New name',
};

const object = (id: string): PlateObject => ({
  id, name: id, triangleCount: 12, bounds: { min: [0, 0, 0], max: [10, 10, 10] },
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirror: [false, false, false] },
});

afterEach(() => cleanup());

it('shows no group-selection indicator and a plain replace-select row when group mode is off', () => {
  const onSelect = vi.fn();
  render(() => <ModelsList objects={[object('a')]} selectedId={undefined} label="Plate objects" labels={labels}
    onSelect={onSelect} onToggleVisible={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} />);

  expect(document.querySelector('.models-item-checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'a' }));
  expect(onSelect).toHaveBeenCalledWith('a');
});

describe('group-select mode', () => {
  it('renders a checkbox indicator per row, checked only for ids in the group selection', () => {
    render(() => <ModelsList objects={[object('a'), object('b')]} selectedId="a" label="Plate objects" labels={labels}
      groupSelectMode groupSelectedIds={new Set(['a'])}
      onSelect={vi.fn()} onToggleVisible={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} />);

    const checkboxes = document.querySelectorAll('.models-item-checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]!.getAttribute('data-checked')).toBe('true');
    expect(checkboxes[1]!.getAttribute('data-checked')).toBe('false');
  });

  it('marks a group-selected row distinctly from the primary via data-group-selected', () => {
    render(() => <ModelsList objects={[object('a'), object('b')]} selectedId="a" label="Plate objects" labels={labels}
      groupSelectMode groupSelectedIds={new Set(['a', 'b'])}
      onSelect={vi.fn()} onToggleVisible={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} />);

    const items = document.querySelectorAll('.models-item');
    expect(items[0]!.getAttribute('data-selected')).toBe('true'); // primary
    expect(items[0]!.getAttribute('data-group-selected')).toBe('true');
    expect(items[1]!.getAttribute('data-selected')).toBe('false'); // grouped, not primary
    expect(items[1]!.getAttribute('data-group-selected')).toBe('true');
  });

  it('still routes a row tap through onSelect (the caller owns the toggle-vs-replace decision)', () => {
    const onSelect = vi.fn();
    render(() => <ModelsList objects={[object('a')]} selectedId={undefined} label="Plate objects" labels={labels}
      groupSelectMode groupSelectedIds={new Set()}
      onSelect={onSelect} onToggleVisible={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'a' }));

    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
