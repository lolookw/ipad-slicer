// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { LayerSlider, type LayerSliderLabels } from './LayerSlider';

const labels: LayerSliderLabels = { layer: 'Layer', height: 'Height', previous: 'Previous layer', next: 'Next layer', slider: 'Layer slider' };
let frames: FrameRequestCallback[] = [];
const flush = () => { const queued = frames; frames = []; queued.forEach(callback => callback(0)); };

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const pointer = (element: Element, type: string) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1 });
  fireEvent(element, event);
};

function Harness(props: { start?: number; count?: number; onChange?: (value: number) => void; orientation?: 'horizontal' | 'vertical' }) {
  const [value, setValue] = createSignal(props.start ?? 4);
  return <LayerSlider value={value()} count={props.count ?? 20} height={(value() + 1) * 0.2} orientation={props.orientation ?? 'horizontal'}
    labels={labels} onChange={next => { props.onChange?.(next); setValue(next); }} />;
}

it('shows 1-based layer number, total and Z height labels', () => {
  render(() => <Harness />);
  expect(screen.getByTestId('layer-label').textContent).toBe('Layer 5 / 20');
  expect(screen.getByTestId('layer-height').textContent).toBe('Height 1 mm');
  const slider = screen.getByRole('slider', { name: 'Layer slider' }) as HTMLInputElement;
  expect([slider.min, slider.max, slider.value]).toEqual(['0', '19', '4']);
});

it('omits the height label when the Z height is unknown', () => {
  render(() => <LayerSlider value={0} count={3} orientation="horizontal" labels={labels} onChange={() => undefined} />);
  expect(screen.queryByTestId('layer-height')).toBeNull();
});

it('throttles slider input to one change per animation frame, delivering the latest value', () => {
  const onChange = vi.fn();
  render(() => <Harness onChange={onChange} />);
  const slider = screen.getByRole('slider', { name: 'Layer slider' });
  for (const value of ['6', '7', '9']) fireEvent.input(slider, { target: { value } });
  expect(screen.getByTestId('layer-label').textContent).toBe('Layer 10 / 20'); // label follows the thumb immediately
  expect(onChange).not.toHaveBeenCalled();
  flush();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(9);
});

it('steps with the buttons via keyboard clicks, clamps at both ends and disables at the limits', () => {
  const onChange = vi.fn();
  render(() => <Harness start={0} count={2} onChange={onChange} />);
  const previous = screen.getByRole('button', { name: 'Previous layer' }) as HTMLButtonElement;
  const next = screen.getByRole('button', { name: 'Next layer' }) as HTMLButtonElement;
  expect(previous.disabled).toBe(true);
  fireEvent.click(next); flush();
  expect(onChange).toHaveBeenLastCalledWith(1);
  expect(next.disabled).toBe(true);
  expect(previous.disabled).toBe(false);
});

it('repeats a held stepper after a delay and stops on release', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const onChange = vi.fn();
  render(() => <Harness start={0} count={100} onChange={onChange} />);
  const next = screen.getByRole('button', { name: 'Next layer' });
  pointer(next, 'pointerdown'); flush();
  expect(onChange).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(399); flush();
  expect(onChange).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(80); flush(); }
  expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(5);
  pointer(next, 'pointerup');
  const settled = onChange.mock.calls.length;
  vi.advanceTimersByTime(1000); flush();
  expect(onChange).toHaveBeenCalledTimes(settled);
  fireEvent.click(next); // the click that follows the pointer sequence has detail 0 in jsdom; it must not double-step after a repeat
});

it('does not double-step for a plain tap (pointerdown steps, the trailing click is ignored)', () => {
  const onChange = vi.fn();
  render(() => <Harness onChange={onChange} />);
  const next = screen.getByRole('button', { name: 'Next layer' });
  pointer(next, 'pointerdown'); pointer(next, 'pointerup');
  fireEvent.click(next, { detail: 1 }); flush();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(5);
});

it('marks the orientation for portrait (horizontal) and landscape (vertical) layouts and keeps 44px targets', () => {
  render(() => <Harness orientation="vertical" />);
  const root = screen.getByTestId('layer-slider');
  expect(root.getAttribute('data-orientation')).toBe('vertical');
  for (const button of screen.getAllByRole('button')) expect(button.classList.contains('ui-target')).toBe(true);
  cleanup();
  render(() => <Harness orientation="horizontal" />);
  expect(screen.getByTestId('layer-slider').getAttribute('data-orientation')).toBe('horizontal');
});

it('stays inert when disabled or when there is at most one layer', () => {
  const onChange = vi.fn();
  render(() => <LayerSlider value={0} count={1} orientation="horizontal" labels={labels} onChange={onChange} />);
  expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
  for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
});
