import { describe, expect, it } from 'vitest';
import { calculateFilamentCost } from './cost';
import { parseGcode } from './gcode-parse';
import { summarizeSlice } from './summary';
import { hasMtFailure, markMtFailure, preferredVariant, retryMt } from './crash-marker';
import { CRASH_MARKER_STORAGE_KEY } from '../app/tier/signals';

const gcode = '; estimated printing time (normal mode) = 27m 25s\n; filament used [g] = 4.09\n; brim_width = 5\n;LAYER_CHANGE\n;LAYER_CHANGE\n';

describe('slice summaries', () => {
  it('parses fallback estimates, layers, effective config and differences', () => {
    const parsed = parseGcode(gcode);
    expect(parsed).toMatchObject({ timeSeconds: 1645, filamentGrams: 4.09, layerCount: 2, effective: { brim_width: '5' } });
    const summary = summarizeSlice(new TextEncoder().encode(gcode).buffer, {}, { brim_width: '8' }, 20, 'USD');
    expect(summary.differences).toEqual([{ key: 'brim_width', requested: '8', effective: '5' }]);
    expect(summary.cost).toEqual({ amount: 0.0818, currency: 'USD' });
  });
  it('prefers valid schema-0.2 statistics but keeps engine cost diagnostic-only', () => {
    const stats = { schemaVersion: '0.2', timeSeconds: { normal: 12 }, filament: { totalMassG: 3, totalCost: 999 } };
    const summary = summarizeSlice(new TextEncoder().encode(gcode).buffer, stats, {}, 20, 'EUR');
    expect(summary).toMatchObject({ timeSeconds: 12, filamentGrams: 3, cost: { amount: .06, currency: 'EUR' }, engineTotalCost: 999 });
  });
  it('keeps missing or malformed values unavailable', () => {
    expect(parseGcode('; filament used [g] = nope')).toMatchObject({ timeSeconds: undefined, filamentGrams: undefined });
    expect(calculateFilamentCost(undefined, 20, 'USD')).toBeUndefined();
    expect(calculateFilamentCost(4.09, undefined, 'USD')).toBeUndefined();
  });
});

it('scopes mt failure markers to a build and keeps probe selection independent', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
  markMtFailure(storage, 'a');
  expect(hasMtFailure(storage, 'a')).toBe(true); expect(hasMtFailure(storage, 'b')).toBe(false);
  expect(values.get(CRASH_MARKER_STORAGE_KEY)).toBe('1');
  expect(preferredVariant('auto', 'mt', true)).toBe('st'); expect(preferredVariant('mt', 'st', false)).toBe('st');
  expect(preferredVariant('mt', 'mt', true)).toBe('mt');
  retryMt(storage, 'a'); expect(hasMtFailure(storage, 'a')).toBe(false); expect(values.has(CRASH_MARKER_STORAGE_KEY)).toBe(false);
});
