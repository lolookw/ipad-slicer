import { render } from 'solid-js/web';
import { afterEach, expect, it, vi } from 'vitest';
import { DiagnosticsSheet, type DiagnosticsLabels } from './DiagnosticsSheet';
import { formatBytes, summarizeLog } from './metrics';
import { engineClient } from '../engine/client';

const labels: DiagnosticsLabels = { heading: 'Diagnostics', isolation: 'Isolation', variant: 'Variant', auto: 'Auto', st: 'Single', mt: 'Multi', unavailableMt: 'Unavailable', retryMt: 'Retry multithread', retryMtSuccess: 'Retry enabled', export: 'Export', recent: 'Recent', load: 'Load', slice: 'Slice', heap: 'Heap' };
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); vi.restoreAllMocks(); });

it('summarizes persisted metrics and formats memory', () => {
  expect(summarizeLog([{ ts: 1, type: 'slice-done', data: { variant: 'mt', loadMs: 12, sliceMs: 34, peakHeapBytes: 1536 } }])).toMatchObject({ variant: 'mt', loadMs: 12, sliceMs: 34, peakHeapBytes: 1536 });
  expect(formatBytes(1536)).toBe('1.5 KB');
});

it('exports persisted entries and refuses mt when the probe gate fails', async () => {
  const host = document.createElement('div'), reload = vi.fn(), retryMultithread = vi.fn(), exportJson = vi.fn<(json: string, name: string) => Promise<void>>(async () => undefined); document.body.append(host);
  const storage = { getItem: vi.fn(() => 'auto'), setItem: vi.fn(), removeItem: vi.fn() };
  dispose = render(() => <DiagnosticsSheet labels={labels} storage={storage} entries={() => [{ ts: 1, type: 'engine-error', data: { message: 'boom' } }]}
    probe={() => ({ variant: 'st', reason: 'no isolation' })} reload={reload} retryMultithread={retryMultithread} exportJson={exportJson} />, host);
  const select = host.querySelector('select')!; select.value = 'mt'; select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(host.textContent).toContain('Unavailable'); expect(storage.setItem).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
  expect(select.value).toBe('auto'); // the rejected pick must not stick in the displayed dropdown
  [...host.querySelectorAll('button')].find(button => button.textContent === 'Retry multithread')!.click(); expect(retryMultithread).not.toHaveBeenCalled();
  [...host.querySelectorAll('button')].find(button => button.textContent === 'Export')!.click(); await Promise.resolve();
  expect(exportJson.mock.calls[0]![0]).toContain('boom');
  host.remove();
});

it('reaches the real multithread retry path after a successful probe', () => {
  const host = document.createElement('div'); document.body.append(host);
  const retry = vi.spyOn(engineClient, 'retryMultithread').mockImplementation(() => undefined);
  dispose = render(() => <DiagnosticsSheet labels={labels} entries={() => []}
    probe={() => ({ variant: 'mt', reason: 'available' })} />, host);
  [...host.querySelectorAll('button')].find(button => button.textContent === 'Retry multithread')!.click();
  expect(retry).toHaveBeenCalledOnce(); expect(host.textContent).toContain('Retry enabled'); host.remove();
});

it('persists an allowed variant before reloading', () => {
  const host = document.createElement('div'), reload = vi.fn(); document.body.append(host);
  const storage = { getItem: vi.fn(() => 'auto'), setItem: vi.fn(), removeItem: vi.fn() };
  dispose = render(() => <DiagnosticsSheet labels={labels} storage={storage} entries={() => []} reload={reload} />, host);
  const select = host.querySelector('select')!; select.value = 'st'; select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(storage.setItem).toHaveBeenCalledWith('ipad-slicer:engine-variant', 'st'); expect(reload).toHaveBeenCalledOnce(); host.remove();
});
