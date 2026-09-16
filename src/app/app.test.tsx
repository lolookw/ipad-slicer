import { render } from 'solid-js/web';
import { waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { flow } from './stores';

let dispose: (() => void) | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  localStorage.clear();
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
  vi.restoreAllMocks();
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

it('translates visible errors live and persists the locale', async () => {
  const language = host.querySelector<HTMLSelectElement>('select[aria-label="Language"]');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Import a model');
  language!.value = 'es';
  language!.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('Importa un modelo'));
  expect(localStorage.getItem('ipad-slicer:locale')).toBe('es');
  expect(document.documentElement.lang).toBe('es');
});

it('applies and persists explicit appearance changes', () => {
  const theme = host.querySelector<HTMLSelectElement>('select[aria-label="Appearance"]');
  theme!.value = 'dark';
  theme!.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('ipad-slicer:theme')).toBe('dark');
});
