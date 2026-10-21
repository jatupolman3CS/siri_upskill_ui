import type { TranslationService } from '../../../../core/i18n/translation.service';

/**
 * Checks whether a tutor profile was anonymized following account erasure (contract P13-17 section 4).
 * The backend sets SLUG = "deleted-{TUTOR_ID:N}" together with its own placeholder display name on every erasure, so the slug is the
 * one reliable marker; the display name is never inspected (it is presentation text and must not be matched as a string).
 */
export function isDeletedTutor(tutor: { slug?: string | null; displayName?: string | null } | null | undefined): boolean {
  if (!tutor) {
    return false;
  }
  return typeof tutor.slug === 'string' && tutor.slug.startsWith('deleted-');
}

/**
 * Returns the localized tutor display name, replacing erased/anonymized tutor profiles with the contracted label.
 */
export function formatTutorDisplayName(
  tutor: { slug?: string | null; displayName?: string | null } | null | undefined,
  i18n: TranslationService,
): string {
  if (isDeletedTutor(tutor)) {
    return i18n.t('tutoring.learner.my.deletedTutor');
  }
  return tutor?.displayName ?? '';
}
