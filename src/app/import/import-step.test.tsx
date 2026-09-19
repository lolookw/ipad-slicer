import { render } from 'solid-js/web';
import { waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App';
import { configuration, flow, result } from '../stores';
import { plate } from '../stores/plate';
import { importSession } from '../../viewer/import-session';

let dispose: (() => void) | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  localStorage.clear();
  plate.clear();
  importSession.reset();
  flow.hasModel.set(false);
  flow.hasResult.set(false);
  flow.step.set('import');
  result.reset();
  configuration.mode.set('simple');
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <App />, host);
});

afterEach(() => {
  dispose?.();
  host.remove();
  vi.restoreAllMocks();
});

it('renders the Import step as a real screen and continues to Configure once a model exists', async () => {
  expect(host.querySelector('.import-pane')).not.toBeNull();
  expect(host.textContent).toContain('Upload from device');
  expect(host.textContent).toContain('Accepted formats: STL and 3MF.');
  expect(host.querySelector('.import-continue')).toBeNull();
  expect([...host.querySelectorAll('.import-sources a')].map(a => a.textContent?.replace(/\s*↗$/, ''))).toEqual(['Printables', 'Thingiverse', 'MakerWorld']);

  const language = host.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!;
  language.value = 'es';
  language.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => expect(host.textContent).toContain('Subir desde el dispositivo'));

  flow.hasModel.set(true);
  host.querySelector<HTMLButtonElement>('.import-continue')!.click();
  expect(flow.step.get()).toBe('configure');
});

it('shows a translated import error inside the Import step only', async () => {
  const input = host.querySelector<HTMLInputElement>('[data-testid="import-file-input"]')!;
  Object.defineProperty(input, 'files', { value: [new File([new Uint8Array([1, 2, 3])], 'broken.stl')], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => expect(host.querySelector('.import-error')?.textContent).toContain('The STL file is empty or too short.'));
  expect(host.querySelector('.viewer-error')?.textContent ?? '').not.toContain('STL file');
});
