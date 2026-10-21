import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';

import { TranslationService } from '../../../core/i18n/translation.service';

/**
 * The texts of the tutor marketplace (`tutoring.*`, Thai and English) are NOT in the base dictionaries (`core/i18n/th.json` / `en.json`): those
 * are part of the initial download of every visitor, and these ~1,500 texts are read only by the people who open a tutoring screen. They live in
 * five lazy pairs of JSON files instead - one per audience - and the route resolver of each audience registers its pair with
 * {@link TranslationService.extend} BEFORE the first page of that audience renders:
 *
 * - `tutoring-shared`  - what every audience needs: the error texts, the enum labels (level, curriculum, booking status, ...), the slot
 *   picker, the form-validation messages and the small shared tutor-form texts. Loaded together with each audience below.
 * - `tutoring-public`  - the public search and profile (`/tutors`, `/tutors/:slug`; server-rendered, so this resolver also runs on the server).
 * - `tutoring-learner` - booking, checkout, join, "my tutoring", lesson reviews, problem reports and learner profiles.
 * - `tutoring-tutor`   - the Tutor Portal (`/instructor/tutoring/**`) including identity verification.
 * - the administrator pair lives with the admin screens (`admin/i18n/`).
 *
 * Three navigation labels stay in the base dictionaries because the always-loaded layouts render them: `tutoring.tutor.nav.label` (studio
 * sidebar), `tutoring.learner.nav` and `tutoring.learner.my.nav` (account menu). Each text exists in exactly one file - the spec next to this
 * file (`tutoring-i18n.spec.ts`) enforces that, the Thai/English parity, and that every screen only uses texts its resolver loads.
 *
 * A repeat visit adds nothing: the same module objects come back and `extend` ignores an object it already holds. Each function must be called
 * in an injection context (a route resolver is one) and reads `inject()` before its first `await`.
 */

async function register(translation: TranslationService, th: Promise<{ readonly default: object }>, en: Promise<{ readonly default: object }>): Promise<void> {
  const [thModule, enModule] = await Promise.all([th, en]);
  translation.extend({ th: thModule.default, en: enModule.default });
}

/** Registers the texts every audience shares. The audience loaders below call it; the administrator screens call it too. */
export function loadSharedTutoringDictionary(translation: TranslationService): Promise<void> {
  return register(translation, import('./tutoring-shared.th.json'), import('./tutoring-shared.en.json'));
}

/** `/tutors` and `/tutors/:slug` - the public search and profile (also rendered on the server). */
export const loadPublicTutoringDictionary: ResolveFn<boolean> = async () => {
  const translation = inject(TranslationService);
  await Promise.all([
    loadSharedTutoringDictionary(translation),
    register(translation, import('./tutoring-public.th.json'), import('./tutoring-public.en.json')),
  ]);
  return true;
};

/** Booking, checkout, join, "my tutoring" and learner profiles - every signed-in learner screen of the marketplace. */
export const loadLearnerTutoringDictionary: ResolveFn<boolean> = async () => {
  const translation = inject(TranslationService);
  await Promise.all([
    loadSharedTutoringDictionary(translation),
    register(translation, import('./tutoring-learner.th.json'), import('./tutoring-learner.en.json')),
  ]);
  return true;
};

/** The Tutor Portal (`/instructor/tutoring/**`). */
export const loadTutorTutoringDictionary: ResolveFn<boolean> = async () => {
  const translation = inject(TranslationService);
  await Promise.all([
    loadSharedTutoringDictionary(translation),
    register(translation, import('./tutoring-tutor.th.json'), import('./tutoring-tutor.en.json')),
  ]);
  return true;
};
