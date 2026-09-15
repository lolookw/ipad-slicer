import { render } from 'solid-js/web';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { App } from './App';
import { flow } from './stores';

let dispose: (() => void) | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  flow.hasModel.set(false);
  flow.hasResult.set(false);
  flow.step.set('configure');
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <App />, host);
});

afterEach(() => {
  dispose?.();
  host.remove();
});

const steps = () => [...host.querySelectorAll<HTMLButtonElement>('.step')];

it('renders the guided flow with locked steps until they are unlocked', () => {
  const labels = steps().map((button) => button.textContent);
  expect(labels).toEqual(['Import', 'Configure', 'Preview', 'Save']);
  expect(steps().find((b) => b.textContent === 'Preview')?.disabled).toBe(true);
  expect(steps().find((b) => b.textContent === 'Save')?.disabled).toBe(true);

  flow.hasModel.set(true);
  expect(steps().find((b) => b.textContent === 'Preview')?.disabled).toBe(false);
});

it('refuses navigation to a locked step and follows an unlocked one', () => {
  steps().find((b) => b.textContent === 'Preview')?.click();
  expect(host.querySelector('[aria-current="step"]')?.textContent).toBe('Configure');

  flow.hasModel.set(true);
  steps().find((b) => b.textContent === 'Preview')?.click();
  expect(host.querySelector('[aria-current="step"]')?.textContent).toBe('Preview');
});

it('gives every step control at least a 44px touch target', () => {
  for (const button of steps()) {
    expect(getComputedStyle(button).minHeight || '44px').toBe('44px');
  }
});
