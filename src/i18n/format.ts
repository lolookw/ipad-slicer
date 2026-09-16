import type { Locale } from './index';

const localeTags: Record<Locale, string> = { en: 'en-US', es: 'es-AR' };

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeTags[locale], options).format(value);
}

export function formatPercent(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return formatNumber(value, locale, { style: 'percent', ...options });
}

