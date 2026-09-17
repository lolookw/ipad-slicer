import { expect, it } from 'vitest';
import { createLog } from './log';
import { formatBytes, summarizeLog } from './panel';

it('summarizes the latest events without treating errors or progress as completed saves/slices', () => {
  const log = createLog();
  expect(summarizeLog(log.entries())).toEqual({});
  log.append('engine-ready', { variant: 'st', loadPath: 'buffered', loadMs: 900 });
  log.append('slice-done', { gcodeBytes: 10, sliceMs: 20, peakHeapBytes: 30 });
  log.append('gcode-save', { method: 'download', mimeType: 'text/plain', bytes: 10 });
  log.append('engine-ready', { variant: 'mt', loadPath: 'streaming', loadMs: 100 });
  log.append('slice-done', { gcodeBytes: 200, sliceMs: 300, peakHeapBytes: 400 });
  log.append('gcode-save', { method: 'cancelled', mimeType: 'text/x.gcode', bytes: 200 });
  log.append('engine-error', { stage: 'slice', message: '<script>bad</script>' });
  log.append('slice-progress', { heapBytes: 999 });
  log.append('unrelated', null);
  expect(summarizeLog(log.entries())).toEqual({
    loadPath: 'streaming', loadMs: 100, gcodeBytes: 200, sliceMs: 300, peakHeapBytes: 400, variant: 'mt', lastSave: 'cancelled',
  });
});

it.each([
  [0, '0 B'], [512, '512 B'], [1536, '1.5 KB'], [292864, '286.0 KB'],
  [9 * 1024 ** 2, '9.0 MB'], [1.2 * 1024 ** 3, '1.20 GB'],
])('formats %s bytes', (bytes, expected) => expect(formatBytes(bytes)).toBe(expected));
