import type { TranslationService } from '../../../core/i18n/translation.service';
import type { PublicReviewer } from './tutoring-review.models';

/**
 * Formats a public reviewer label safely according to contract P13-13 section 4 / section 12:
 * - Nickname: the adult learner's nickname.
 * - Guardian: "Parent of {band} student" (or generic if unspecified). Minors NEVER expose their nickname.
 * - Anonymous: "Anonymous user".
 */
export function formatReviewerLabel(reviewer: PublicReviewer, i18n: TranslationService): string {
  if (reviewer.kind === 'Nickname' && reviewer.nickname) {
    return reviewer.nickname;
  }

  if (reviewer.kind === 'Guardian') {
    if (reviewer.gradeBand) {
      const band = i18n.t(`tutoring.enums.reviewerGradeBand.${reviewer.gradeBand}`);
      return i18n.t('tutoring.enums.reviewerLabel.guardian', { band });
    }
    return i18n.t('tutoring.enums.reviewerLabel.guardianGeneral');
  }

  return i18n.t('tutoring.enums.reviewerLabel.anonymous');
}

/** Calculates an integer percentage (0..100) for a rating distribution bar. */
export function distributionPercentage(count: number, total: number): number {
  if (total <= 0 || count <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((count / total) * 100));
}
