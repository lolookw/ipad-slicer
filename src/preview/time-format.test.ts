import { describe, expect, it } from 'vitest';
import { formatDurationMs } from './time-format';

describe('formatDurationMs', () => {
  it('formats hours and minutes', () => {
    expect(formatDurationMs(2 * 3_600_000 + 14 * 60_000)).toBe('2h 14m');
  });
  it('omits the hours part under an hour', () => {
    expect(formatDurationMs(45 * 60_000)).toBe('45m');
  });
  it('floors to <1m for a very small duration', () => {
    expect(formatDurationMs(10_000)).toBe('<1m');
    expect(formatDurationMs(0)).toBe('<1m');
  });
  it('rounds to the nearest minute', () => {
    expect(formatDurationMs(89 * 60_000 + 40_000)).toBe('1h 30m');
  });
  it('returns an empty string for invalid input', () => {
    expect(formatDurationMs(-5)).toBe('');
    expect(formatDurationMs(Number.NaN)).toBe('');
    expect(formatDurationMs(Number.POSITIVE_INFINITY)).toBe('');
  });
});
