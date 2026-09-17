import type { LogEntry } from '../instrumentation/log';

export interface DiagnosticMetrics {
  loadPath?: string;
  loadMs?: number;
  sliceMs?: number;
  gcodeBytes?: number;
  peakHeapBytes?: number;
  variant?: string;
  lastSave?: string;
}

export function summarizeLog(entries: readonly LogEntry[]): DiagnosticMetrics {
  const metrics: DiagnosticMetrics = {};
  for (const { type, data } of entries) {
    if (!data || typeof data !== 'object') continue;
    const value = data as Record<string, unknown>;
    if (type === 'engine-ready') {
      metrics.loadPath = typeof value.loadPath === 'string' ? value.loadPath : undefined;
      metrics.loadMs = typeof value.loadMs === 'number' ? value.loadMs : undefined;
      metrics.variant = typeof value.variant === 'string' ? value.variant : undefined;
    } else if (type === 'slice-done') {
      for (const key of ['sliceMs', 'gcodeBytes', 'peakHeapBytes'] as const)
        metrics[key] = typeof value[key] === 'number' ? value[key] : undefined;
      metrics.variant = typeof value.variant === 'string' ? value.variant : metrics.variant;
      metrics.loadMs = typeof value.loadMs === 'number' ? value.loadMs : metrics.loadMs;
    } else if (type === 'gcode-save') metrics.lastSave = typeof value.method === 'string' ? value.method : undefined;
  }
  return metrics;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
