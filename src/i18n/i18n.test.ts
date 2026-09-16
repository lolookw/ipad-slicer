import { flatten } from '@solid-primitives/i18n';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { formatNumber, formatPercent } from './format';
import { resolveLocale } from './index';

describe('localization', () => {
  it('keeps English and Spanish dictionary keys in parity', () => {
    expect(Object.keys(flatten(es)).sort()).toEqual(Object.keys(flatten(en)).sort());
  });

  it.each([
    ['es', ['en-US'], 'es'],
    [null, ['fr-FR', 'es-AR'], 'es'],
    [null, ['en-GB'], 'en'],
    ['invalid', ['fr-FR'], 'en'],
  ] as const)('resolves stored %s and browser languages', (stored, languages, expected) => {
    expect(resolveLocale(stored, languages)).toBe(expected);
  });

  it('formats numbers and percentages with locale-specific separators', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'es')).toBe('1.234,5');
    expect(formatPercent(0.25, 'es')).toBe('25%');
  });
});
