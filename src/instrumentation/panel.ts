import type { createLog } from './log';
import { formatBytes, summarizeLog } from '../diagnostics/metrics';
export { formatBytes, summarizeLog } from '../diagnostics/metrics';
type Log = ReturnType<typeof createLog>;

export function createPanel(root: HTMLElement, options: { log: Log; onExportLog: () => void; recentCount?: number }): { render(): void } {
  const document = root.ownerDocument;
  function render(): void {
    const entries = options.log.entries();
    const metrics = summarizeLog(entries);
    const list = document.createElement('dl');
    const ms = (value?: number) => value === undefined ? '-' : `${value.toFixed(0)} ms`;
    const size = (value?: number) => value === undefined ? '-' : formatBytes(value);
    const error = [...entries].reverse().find((entry) => entry.type === 'engine-error')?.data;
    const errorData = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const rows = {
      crossOriginIsolated: String(globalThis.crossOriginIsolated ?? false),
      userAgent: globalThis.navigator?.userAgent ?? '-',
      'Engine load path': metrics.loadPath ?? '-', 'Engine load': ms(metrics.loadMs),
      'Slice time': ms(metrics.sliceMs), 'G-code size': size(metrics.gcodeBytes),
      'Peak heap': size(metrics.peakHeapBytes), 'Last save': metrics.lastSave ?? '-',
      'Last error': error ? `${errorData.stage ?? 'unknown'}: ${errorData.message ?? ''}` : '-',
    };
    for (const [label, value] of Object.entries(rows)) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      list.append(term, description);
    }
    const button = (label: string, action: () => void) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.addEventListener('click', action);
      return element;
    };
    const recent = document.createElement('ul');
    const count = Math.max(0, Math.floor(options.recentCount ?? 15));
    for (const entry of entries.slice(Math.max(0, entries.length - count)).reverse()) {
      const item = document.createElement('li');
      item.textContent = `${new Date(entry.ts).toTimeString().slice(0, 8)} ${entry.type}`;
      recent.append(item);
    }
    root.replaceChildren(list, button('Export log', options.onExportLog),
      button('Clear log', () => { options.log.clear(); render(); }), recent);
  }
  return { render };
}
