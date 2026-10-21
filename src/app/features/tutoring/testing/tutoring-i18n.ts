/**
 * Test plumbing for the tutor marketplace's texts. In the app the `tutoring.*` texts are lazy dictionaries that each audience's route resolver
 * registers (`../i18n/tutoring-dictionaries.ts`); a spec that renders a single component has no router, so it registers them here instead and
 * switches the language. Not used by the app.
 */
import { TestBed } from '@angular/core/testing';

import { type DictionaryExtension, type Locale, TranslationService } from '../../../core/i18n/translation.service';
import baseEn from '../../../core/i18n/en.json';
import baseTh from '../../../core/i18n/th.json';
import adminEn from '../admin/i18n/admin-tutoring.en.json';
import adminTh from '../admin/i18n/admin-tutoring.th.json';
import learnerEn from '../i18n/tutoring-learner.en.json';
import learnerTh from '../i18n/tutoring-learner.th.json';
import publicEn from '../i18n/tutoring-public.en.json';
import publicTh from '../i18n/tutoring-public.th.json';
import sharedEn from '../i18n/tutoring-shared.en.json';
import sharedTh from '../i18n/tutoring-shared.th.json';
import tutorEn from '../i18n/tutoring-tutor.en.json';
import tutorTh from '../i18n/tutoring-tutor.th.json';

export const SHARED_DICTIONARY: DictionaryExtension = { th: sharedTh, en: sharedEn };
export const PUBLIC_DICTIONARY: DictionaryExtension = { th: publicTh, en: publicEn };
export const LEARNER_DICTIONARY: DictionaryExtension = { th: learnerTh, en: learnerEn };
export const TUTOR_DICTIONARY: DictionaryExtension = { th: tutorTh, en: tutorEn };
export const ADMIN_DICTIONARY: DictionaryExtension = { th: adminTh, en: adminEn };

const ALL_DICTIONARIES: readonly DictionaryExtension[] = [SHARED_DICTIONARY, PUBLIC_DICTIONARY, LEARNER_DICTIONARY, TUTOR_DICTIONARY, ADMIN_DICTIONARY];

/**
 * Registers every tutoring dictionary with the current TestBed's `TranslationService` and switches it to `locale` (English by default - the
 * specs assert English text). Call after `configureTestingModule`, before the component under test is created.
 */
export function useTutoringLanguage(locale: Locale = 'en'): TranslationService {
  const translation = TestBed.inject(TranslationService);
  for (const dictionary of ALL_DICTIONARIES) {
    translation.extend(dictionary);
  }
  translation.setLocale(locale);
  return translation;
}

function mergeInto(target: Record<string, unknown>, source: object): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (value !== null && typeof value === 'object') {
      target[key] = mergeInto(existing !== null && typeof existing === 'object' ? (existing as Record<string, unknown>) : {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/**
 * The base dictionary plus every tutoring dictionary as one nested object, per language - what a user who has opened every audience's screens
 * sees. For specs that probe a key by its dot path (`hasKey(TUTORING_EN, 'tutoring.errors.generic')`) rather than render a component.
 */
export const TUTORING_TH: object = ALL_DICTIONARIES.reduce<Record<string, unknown>>((merged, dictionary) => mergeInto(merged, dictionary.th), mergeInto({}, baseTh));
export const TUTORING_EN: object = ALL_DICTIONARIES.reduce<Record<string, unknown>>((merged, dictionary) => mergeInto(merged, dictionary.en), mergeInto({}, baseEn));
