import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';

import { TranslationService } from '../../../../core/i18n/translation.service';
import { loadSharedTutoringDictionary } from '../../i18n/tutoring-dictionaries';

/**
 * Loads the administrator tutoring texts (`tutoring.admin.*`, Thai and English) the first time one of these routes is opened and hands
 * them to {@link TranslationService.extend}. They live in two lazy JSON files instead of `core/i18n/th.json` / `en.json` because the
 * base dictionaries are part of the initial download of every visitor, and these ~60 kB of text are read by administrators only.
 * A route resolver, so the texts are there before the first page of the area renders; a repeat visit adds nothing (the same module
 * objects come back and `extend` ignores an object it already has). The texts every tutoring audience shares (enum labels, form-validation
 * messages, ...) are registered alongside - see `../../i18n/tutoring-dictionaries.ts`.
 */
export const loadAdminTutoringDictionary: ResolveFn<boolean> = async () => {
  const translation = inject(TranslationService);
  const [th, en] = await Promise.all([import('./admin-tutoring.th.json'), import('./admin-tutoring.en.json'), loadSharedTutoringDictionary(translation)]);
  translation.extend({ th: th.default, en: en.default });
  return true;
};
