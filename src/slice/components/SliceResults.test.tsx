import { render } from 'solid-js/web';
import { afterEach, expect, it, vi } from 'vitest';
import { SliceActivity, SliceResults, type SliceResultLabels } from './SliceResults';

const labels: SliceResultLabels = { time: 'Time', mass: 'Mass', cost: 'Cost', layers: 'Layers', unavailable: 'Unavailable', priceBasis: 'Price', requested: 'Requested', effective: 'Effective', stale: 'Outdated result', slicing: 'Slicing', preparing: 'Preparing engine', ready: 'Engine ready', finishing: 'Finishing previous slice', save: 'Save G-code' };
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); vi.useRealTimers(); });

it('renders explicit unavailable, pricing, stale and requested/effective states', () => {
  const host = document.createElement('div');
  dispose = render(() => <SliceResults stale currency="USD" summary={{ layerCount: 2, requested: { brim_width: '3', filament_cost: ['20'] }, effective: { brim_width: '5' }, differences: [{ key: 'brim_width', requested: '3', effective: '5' }], cost: undefined }} labels={labels} onSave={() => undefined} />, host);
  expect(host.textContent).toContain('Unavailable');
  expect(host.textContent).toContain('Outdated result');
  expect(host.textContent).toContain('brim_width = 3');
  expect(host.textContent).toContain('brim_width = 5');
  expect(host.textContent).toContain('20 USD/kg');
});

it('shows an indeterminate elapsed clock and never a percentage', () => {
  vi.useFakeTimers(); const host = document.createElement('div');
  dispose = render(() => <SliceActivity active variant="mt" labels={labels} />, host);
  vi.advanceTimersByTime(2250);
  expect(host.textContent).toContain('2s');
  expect(host.textContent).toContain('MT');
  expect(host.textContent).not.toContain('%');
  expect(host.textContent).toContain('Slicing'); // must read "slicing", not "engine ready", while active
  expect(host.textContent).not.toContain('Engine ready');
});

it('shows the editable single-thread finishing state after cancellation', () => {
  const host = document.createElement('div');
  dispose = render(() => <SliceActivity active={false} finishing labels={labels} />, host);
  expect(host.textContent).toBe('Finishing previous slice');
  expect(host.querySelector('.spinner')).toBeNull();
});
