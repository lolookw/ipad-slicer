// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Button, Popover, Segmented, Sheet, Slider, Stepper } from './index';
import { readFileSync } from 'node:fs';
const css = readFileSync('src/ui/tokens.css', 'utf8');

beforeEach(() => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
});
afterEach(() => { cleanup(); document.head.querySelectorAll('style').forEach(el => el.remove()); vi.useRealTimers(); vi.restoreAllMocks(); });
const key = (element: Element, value: string, shiftKey = false) => fireEvent.keyDown(element, { key: value, shiftKey });
const pointer = (element: Element, type: string, clientX = 0, clientY = 0) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, pointerId: 1 });
  fireEvent(element, event);
};

it('declares at least 44px targets for every control and provides theme, safe-area and focus tokens', () => {
  render(() => <><Button>Save</Button><Sheet open label="Settings" onClose={() => {}}>Content</Sheet>
    <Segmented label="Mode" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} value="a" onChange={() => {}} />
    <Stepper label="Height" value={1} min={0} max={10} onChange={() => {}} /><Slider label="Fill" value={1} min={0} max={10} onChange={() => {}} /></>);
  document.querySelectorAll<HTMLElement>('button, input').forEach(el => {
    expect(el.classList.contains('ui-target')).toBe(true);
  });
  // jsdom has no layout engine: verify the shared sizing rule, not fictional pixel bounds.
  const target = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
    .find(rule => rule instanceof CSSStyleRule && rule.selectorText === '.ui-target') as CSSStyleRule;
  expect(target.style.getPropertyValue('min-width')).toBe('max(44px, var(--hit))');
  expect(target.style.getPropertyValue('min-height')).toBe('max(44px, var(--hit))');
  expect(css).toContain('--touch-target-min: 44px');
  expect(css).toContain(':focus-visible');
  expect(css).toContain('prefers-color-scheme: dark');
  expect(css).toContain("[data-theme='light']");
  expect(css).toContain('env(safe-area-inset-bottom');
});

it('disables Button while loading or disabled and exposes variants, sizes and decorative icons', () => {
  const click = vi.fn();
  render(() => <><Button loading onClick={click}>Slice</Button><Button disabled>Stop</Button>
    <Button variant="danger" size="large" icon="!">Delete</Button></>);
  fireEvent.click(screen.getByText('Slice'));
  expect(click).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Slice' }).getAttribute('aria-busy')).toBe('true');
  expect((screen.getByText('Stop') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Delete').getAttribute('data-variant')).toBe('danger');
  expect(screen.getByText('Delete').getAttribute('data-size')).toBe('large');
});

it('changes Sheet detents, traps focus, dismisses, unlocks scrolling and restores focus', () => {
  const close = vi.fn();
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const view = render(() => <Sheet open label="Settings" onClose={close}><Button>Last</Button></Sheet>);
  const handle = screen.getByRole('button', { name: 'Resize sheet' }), panel = screen.getByRole('dialog');
  expect(panel.getAttribute('aria-modal')).toBe('true');
  expect(document.body.style.overflow).toBe('hidden');
  expect(panel.getAttribute('data-detent')).toBe('half');
  key(handle, 'ArrowDown'); expect(panel.getAttribute('data-detent')).toBe('peek');
  pointer(handle, 'pointerdown', 0, 200); pointer(handle, 'pointerup', 0, 100);
  fireEvent.click(handle);
  expect(panel.getAttribute('data-detent')).toBe('half');
  key(handle, 'ArrowUp'); expect(panel.getAttribute('data-detent')).toBe('full');
  screen.getByText('Last').focus(); key(document.activeElement!, 'Tab'); expect(document.activeElement).toBe(handle);
  key(handle, 'Tab', true); expect(document.activeElement).toBe(screen.getByText('Last'));
  trigger.focus(); expect(document.activeElement).toBe(handle);
  fireEvent.click(panel); expect(close).not.toHaveBeenCalled();
  key(panel, 'Escape'); fireEvent.click(panel.parentElement!); expect(close).toHaveBeenCalledTimes(2);
  view.unmount(); expect(document.body.style.overflow).toBe(''); expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it.each(['bottom', 'top', 'left', 'right'] as const)('flips %s popovers and dismisses only outside or on Escape', placement => {
  const close = vi.fn(), anchor = document.createElement('button');
  document.body.append(anchor);
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, bottom: 120, left: 0, right: 160, width: 160, height: 120, toJSON() {} });
  const x = placement === 'right' ? innerWidth - 5 : 5, y = placement === 'bottom' ? innerHeight - 5 : 5;
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ x, y, top: y, bottom: y + 2, left: x, right: x + 2, width: 2, height: 2, toJSON() {} });
  render(() => <Popover open anchor={anchor} placement={placement} label="Options" onClose={close}>Content</Popover>);
  const panel = screen.getByRole('dialog');
  expect(panel.getAttribute('data-placement')).toBe({ bottom: 'top', top: 'bottom', left: 'right', right: 'left' }[placement]);
  pointer(panel, 'pointerdown'); pointer(anchor, 'pointerdown'); expect(close).not.toHaveBeenCalled();
  pointer(document.body, 'pointerdown'); key(panel, 'Escape'); expect(close).toHaveBeenCalledTimes(2);
  anchor.remove();
});

it('selects Segmented options with wrapping arrows, Home/End and taps', () => {
  render(() => { const [value, set] = createSignal('a'); return <Segmented label="Mode" value={value()} onChange={set}
    options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />; });
  const [a, b] = screen.getAllByRole('radio');
  key(a!, 'ArrowLeft'); expect(b!.getAttribute('aria-checked')).toBe('true'); expect(document.activeElement).toBe(b);
  key(b!, 'Home'); expect(a!.getAttribute('aria-checked')).toBe('true');
  key(a!, 'End'); expect(b!.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(a!); expect(a!.getAttribute('aria-checked')).toBe('true');
});

it('clamps and snaps numeric entry and repeats Stepper long presses without an extra release click', () => {
  vi.useFakeTimers();
  render(() => { const [value, set] = createSignal(0); return <Stepper label="Height" unit="mm" value={value()} onChange={set} min={0} max={2} step={0.25} />; });
  const input = screen.getByRole('spinbutton') as HTMLInputElement, increase = screen.getByRole('button', { name: 'Increase Height' });
  expect((screen.getByRole('button', { name: 'Decrease Height' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(increase); expect(input.value).toBe('0.25');
  pointer(increase, 'pointerdown'); vi.advanceTimersByTime(600); pointer(increase, 'pointerup'); fireEvent.click(increase);
  expect(input.value).toBe('1'); vi.advanceTimersByTime(500); expect(input.value).toBe('1');
  fireEvent.change(input, { target: { value: '0.62' } }); expect(input.value).toBe('0.5');
  fireEvent.change(input, { target: { value: '99' } }); expect(input.value).toBe('2');
  fireEvent.change(input, { target: { value: '-2' } }); expect(input.value).toBe('0');
});

it('updates Slider through keyboard, pointer drag and native input with ticks and a value label', () => {
  render(() => { const [value, set] = createSignal(0); return <Slider label="Fill" unit="%" value={value()} onChange={set} min={0} max={100} step={10} ticks={[0, 50, 100]} />; });
  const slider = screen.getByRole('slider') as HTMLInputElement;
  key(slider, 'ArrowRight'); expect(slider.value).toBe('10');
  key(slider, 'End'); expect(slider.value).toBe('100'); key(slider, 'Home'); expect(slider.value).toBe('0');
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, right: 100, top: 0, bottom: 44, width: 100, height: 44, toJSON() {} });
  pointer(slider, 'pointerdown', 54); expect(slider.value).toBe('50');
  pointer(slider, 'pointermove', 200); expect(slider.value).toBe('100'); pointer(slider, 'pointerup');
  pointer(slider, 'pointermove', 0); expect(slider.value).toBe('100');
  fireEvent.input(slider, { target: { value: '20' } }); expect(slider.getAttribute('aria-valuetext')).toBe('20%');
  expect(document.querySelectorAll('datalist option')).toHaveLength(3);
});

it('keeps disabled numeric and segmented controls inert and clears repeat timers on disposal', () => {
  const change = vi.fn();
  const view = render(() => <><Stepper disabled label="Height" value={1} min={0} max={2} onChange={change} />
    <Slider disabled label="Fill" value={1} min={0} max={2} onChange={change} />
    <Segmented disabled label="Mode" value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={change} /></>);
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(el => expect(el.disabled).toBe(true));
  pointer(screen.getByRole('slider'), 'pointerdown', 50);
  fireEvent.click(screen.getByText('B')); expect(change).not.toHaveBeenCalled();
  view.unmount();
  vi.useFakeTimers();
  const active = render(() => <Stepper label="Height" value={1} min={0} max={5} onChange={change} />);
  pointer(screen.getByRole('button', { name: 'Increase Height' }), 'pointerdown');
  active.unmount(); vi.advanceTimersByTime(1000); expect(change).not.toHaveBeenCalled();
});
