import { flatten, translator, type Flatten } from '@solid-primitives/i18n';
import { createResource, type Accessor } from 'solid-js';
import { en, type Dictionary } from './en';

export type Locale = 'en' | 'es';
export const LOCALE_STORAGE_KEY = 'ipad-slicer:locale';

type FlatDictionary = Flatten<Dictionary>;
export type TranslationKey = {
  [K in keyof FlatDictionary]: FlatDictionary[K] extends string ? K : never;
}[keyof FlatDictionary] & string;

const flatEnglish = flatten(en) as FlatDictionary;

export function resolveLocale(stored: string | null, languages: readonly string[]): Locale {
  if (stored === 'en' || stored === 'es') return stored;
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'en' || base === 'es') return base;
  }
  return 'en';
}

async function loadDictionary(locale: Locale): Promise<FlatDictionary> {
  if (locale === 'en') return flatEnglish;
  const { es } = await import('./es');
  return flatten(es) as FlatDictionary;
}

export function createI18n(locale: Accessor<Locale>) {
  const [dictionary] = createResource(locale, loadDictionary, { initialValue: flatEnglish });
  const translate = translator(dictionary);
  return {
    dictionary,
    t(key: TranslationKey): string {
      return translate(key) as string;
    },
  };
}

