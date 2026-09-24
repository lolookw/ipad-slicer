import { flatten, translator } from '@solid-primitives/i18n';
import { describe, expect, it } from 'vitest';
import type { TranslationKey } from '../i18n';
import { en, type Dictionary } from '../i18n/en';
import { es } from '../i18n/es';
import { optionLabel, type Translate } from './optionLabels';
import {
  BED_TYPES, BRIM_TYPES, FUZZY_SKINS, GCODE_FLAVORS, INFILL_PATTERNS, IRONING_TYPES, SEAM_POSITIONS, SUPPORT_TYPES,
} from './schema';

// Exercises the exact same flatten()/translator() pipeline the running app uses (see
// src/i18n/index.ts), against the real en.ts/es.ts dictionaries, so a missing or
// mistyped settings.options entry fails here instead of only showing up in the UI.
function realTranslate(dictionary: Dictionary): Translate {
  const flat = flatten(dictionary);
  const translate = translator(() => flat);
  return key => translate(key) as string;
}
const translateEn = realTranslate(en);
const translateEs = realTranslate(es);

const missingTranslate: Translate = () => undefined as unknown as string;
const emptyTranslate: Translate = () => '';

describe('optionLabel', () => {
  it('returns the mapped friendly label for a known value, in English', () => {
    expect(optionLabel(translateEn, 'sparse_infill_pattern', 'crosshatch')).toBe('Crosshatch');
    expect(optionLabel(translateEn, 'brim_type', 'auto_brim')).toBe('Auto');
    expect(optionLabel(translateEn, 'support_type', 'normal(auto)')).toBe('Normal (automatic)');
  });

  it('returns the mapped friendly label for a known value, in Spanish', () => {
    expect(optionLabel(translateEs, 'sparse_infill_pattern', 'crosshatch')).toBe('Entramado cruzado');
    expect(optionLabel(translateEs, 'brim_type', 'auto_brim')).toBe('Automático');
    expect(optionLabel(translateEs, 'support_type', 'normal(auto)')).toBe('Normal (automático)');
  });

  it('falls back to the raw value when the translator has no entry for that value (a future enum member)', () => {
    expect(optionLabel(missingTranslate, 'sparse_infill_pattern', 'some-future-pattern')).toBe('some-future-pattern');
    expect(optionLabel(emptyTranslate, 'sparse_infill_pattern', 'some-future-pattern')).toBe('some-future-pattern');
  });

  it('falls back to the raw value for a setting key with no option group at all, without calling the translator', () => {
    let called = false;
    const spy: Translate = key => { called = true; return key; };
    expect(optionLabel(spy, 'layer_height', '0.2')).toBe('0.2');
    expect(called).toBe(false);
  });

  it('never throws for an empty raw value', () => {
    expect(() => optionLabel(translateEn, 'sparse_infill_pattern', '')).not.toThrow();
  });

  const enumsBySetting = {
    support_type: SUPPORT_TYPES, brim_type: BRIM_TYPES, sparse_infill_pattern: INFILL_PATTERNS,
    curr_bed_type: BED_TYPES, gcode_flavor: GCODE_FLAVORS, ironing_type: IRONING_TYPES,
    seam_position: SEAM_POSITIONS, fuzzy_skin: FUZZY_SKINS,
  } as const;

  it.each(Object.entries(enumsBySetting))('has a real, non-raw English label for every %s value', (settingKey, values) => {
    for (const value of values) {
      const label = optionLabel(translateEn, settingKey as keyof typeof enumsBySetting, value);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(value); // every raw value gets an actual translated label, never itself verbatim
    }
  });

  it.each(Object.entries(enumsBySetting))('has a real, non-empty Spanish label for every %s value', (settingKey, values) => {
    for (const value of values) {
      const label = optionLabel(translateEs, settingKey as keyof typeof enumsBySetting, value);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('keeps every settings.options group identical in shape (keys) between en and es', () => {
    for (const group of Object.keys(en.settings.options) as (keyof typeof en.settings.options)[]) {
      expect(Object.keys(es.settings.options[group]).sort()).toEqual(Object.keys(en.settings.options[group]).sort());
    }
  });
});
