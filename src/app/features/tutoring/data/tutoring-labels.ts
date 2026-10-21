import type { Locale } from '../../../core/i18n/translation.service';
import type { DisputeCategory, DisputeFlow, DisputeResolution, DisputeStatus } from './tutoring-dispute.models';
import type { BookingStatus, LearnerGrade } from './tutoring-learner.models';
import type { PackageCreditStatus, PackagePurchaseStatus } from './tutoring-package-purchase.models';
import type {
  DayOfWeekIndex,
  SessionFormat,
  TutorCurriculum,
  TutorGender,
  TutorLevel,
  TutorSort,
} from './tutoring-public.models';

/**
 * i18n keys for the closed enums of the tutoring API. They are built (not literal) so `i18n-guard.spec` cannot see them;
 * `tutoring-labels.spec.ts` therefore asserts every value of every enum resolves in both dictionaries.
 */
export const levelLabelKey = (level: TutorLevel): string => `tutoring.enums.level.${level}`;
export const curriculumLabelKey = (curriculum: TutorCurriculum): string => `tutoring.enums.curriculum.${curriculum}`;
export const genderLabelKey = (gender: TutorGender): string => `tutoring.enums.gender.${gender}`;
export const formatLabelKey = (format: SessionFormat): string => `tutoring.enums.format.${format}`;
export const sortLabelKey = (sort: TutorSort): string => `tutoring.enums.sort.${sort}`;
export const gradeLabelKey = (grade: LearnerGrade): string => `tutoring.enums.grade.${grade}`;
export const bookingStatusLabelKey = (status: BookingStatus): string => `tutoring.enums.bookingStatus.${status}`;
export const packageStatusLabelKey = (status: PackagePurchaseStatus): string => `tutoring.enums.packageStatus.${status}`;
export const packageCreditStatusLabelKey = (status: PackageCreditStatus): string => `tutoring.enums.packageCreditStatus.${status}`;
export const disputeCategoryLabelKey =(category: DisputeCategory): string => `tutoring.enums.disputeCategory.${category}`;
export const disputeStatusLabelKey = (status: DisputeStatus): string => `tutoring.enums.disputeStatus.${status}`;
export const disputeFlowLabelKey = (flow: DisputeFlow): string => `tutoring.enums.disputeFlow.${flow}`;
export const disputeResolutionLabelKey = (resolution: DisputeResolution): string => `tutoring.enums.disputeResolution.${resolution}`;

/** System lines of a dispute thread carry a short code instead of text; an unknown code reads as a generic update. */
const SYSTEM_MESSAGE_CODES: readonly string[] = ['opened', 'claimed', 'decided', 'withdrawn', 'escrow_too_late'];
export const DISPUTE_SYSTEM_MESSAGE_CODES = SYSTEM_MESSAGE_CODES;
export const disputeSystemMessageKey = (code: string): string =>
  `tutoring.enums.disputeSystemMessage.${SYSTEM_MESSAGE_CODES.includes(code) ? code : 'unknown'}`;

/** `0` = Sunday ... `6` = Saturday. */
export const weekdayLabelKey = (day: DayOfWeekIndex): string => `tutoring.enums.weekday.${day}`;

/** Rating shown with one decimal (the API sends up to two; "4.67" and "4.7" read the same to a person). */
export function roundRating(average: number): number {
  return Math.round(average * 10) / 10;
}

/** Thai or English name of a bilingual API entity, following the language picked in the header. */
export function localizedName(entity: { readonly nameTh: string; readonly nameEn: string }, locale: Locale): string {
  return locale === 'th' ? entity.nameTh : entity.nameEn;
}

/** Collapses whitespace and shortens `text` to at most `max` characters, ending with an ellipsis when it was cut. */
export function truncateText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) {
    return clean;
  }
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
