import { PREFERRED_DURATION_MINUTES } from '../data/tutoring-booking.util';
import type { TutorPackage, UpsertPackageRequest } from '../data/tutoring-packages.models';
import { type FieldIssues, decimalPlaces, integerIssue, issue, parseNumber } from '../ui/tutor-form.util';

/**
 * Pure form logic of the tutor package screen (P13-25). The ranges are the DEFAULTS of the server options
 * `Tutoring:Packages:*` (P13-12 section 3) - no endpoint exposes them, so they are mirrored here purely so a mistake is shown before
 * the round trip. The allowed lesson LENGTHS are not mirrored: they are the server's list (`allowedDurationMinutes` of the tutor's
 * profile read) and the validator takes it as a required argument. The server re-checks every rule (and the price floor, the per-tutor
 * limit and duplicates, which depend on data the client does not have) and its answer always wins.
 * Nothing here computes a price: the price of a package is whatever the server answers.
 */
export const PACKAGE_LIMITS = {
  sessionCount: { min: 2, max: 30 },
  discountPercent: { min: 0, max: 50 },
  validDays: { min: 7, max: 365, default: 90 },
} as const;

export type PackageField = 'offeringId' | 'sessionCount' | 'durationMinutes' | 'discountPercent' | 'validDays';

export interface PackageFormValue {
  readonly offeringId: string;
  readonly sessionCount: string;
  readonly durationMinutes: string;
  readonly discountPercent: string;
  readonly validDays: string;
  readonly isActive: boolean;
}

/** C# property names of `UpsertPackageRequest` -> form fields. */
export const PACKAGE_PROPERTY_TO_FIELD: Readonly<Record<string, PackageField>> = {
  OfferingId: 'offeringId',
  SessionCount: 'sessionCount',
  DurationMinutes: 'durationMinutes',
  DiscountPercent: 'discountPercent',
  ValidDays: 'validDays',
};

/**
 * The lesson length a new package starts on: 60 minutes when the server allows it (the usual case), else the shortest length it allows.
 * `''` (nothing selected) for an empty list - a length the server did not offer is never preselected.
 */
export function defaultPackageDuration(allowedDurations: readonly number[]): string {
  if (allowedDurations.length === 0) {
    return '';
  }
  return String(allowedDurations.includes(PREFERRED_DURATION_MINUTES) ? PREFERRED_DURATION_MINUTES : Math.min(...allowedDurations));
}

export function emptyPackageForm(offeringId: string, allowedDurations: readonly number[]): PackageFormValue {
  return {
    offeringId,
    sessionCount: '10',
    durationMinutes: defaultPackageDuration(allowedDurations),
    discountPercent: '10',
    validDays: String(PACKAGE_LIMITS.validDays.default),
    isActive: true,
  };
}

export function packageToForm(tutorPackage: TutorPackage): PackageFormValue {
  return {
    offeringId: tutorPackage.offering.offeringId,
    sessionCount: String(tutorPackage.sessionCount),
    durationMinutes: String(tutorPackage.durationMinutes),
    discountPercent: String(tutorPackage.discountPercent),
    validDays: String(tutorPackage.validDays),
    isActive: tutorPackage.isActive,
  };
}

export function validatePackage(value: PackageFormValue, allowedDurations: readonly number[]): FieldIssues<PackageField> {
  const issues: FieldIssues<PackageField> = {};
  if (value.offeringId === '') {
    issues.offeringId = issue('tutoring.tutor.validation.required');
  }
  const sessions = integerIssue(value.sessionCount, PACKAGE_LIMITS.sessionCount.min, PACKAGE_LIMITS.sessionCount.max);
  if (sessions) {
    issues.sessionCount = sessions;
  }
  if (!allowedDurations.includes(Number(value.durationMinutes))) {
    issues.durationMinutes = issue('tutoring.tutor.validation.notAllowed');
  }
  const days = integerIssue(value.validDays, PACKAGE_LIMITS.validDays.min, PACKAGE_LIMITS.validDays.max);
  if (days) {
    issues.validDays = days;
  }

  const discount = parseNumber(value.discountPercent);
  if (discount === null) {
    issues.discountPercent = issue('tutoring.tutor.validation.required');
  } else if (Number.isNaN(discount)) {
    issues.discountPercent = issue('tutoring.tutor.validation.notANumber');
  } else if (decimalPlaces(discount) > 2) {
    issues.discountPercent = issue('tutoring.tutor.validation.tooManyDecimals');
  } else if (discount < PACKAGE_LIMITS.discountPercent.min || discount > PACKAGE_LIMITS.discountPercent.max) {
    issues.discountPercent = issue('tutoring.tutor.validation.outOfRange', { min: PACKAGE_LIMITS.discountPercent.min, max: PACKAGE_LIMITS.discountPercent.max });
  }
  return issues;
}

export function packageRequest(value: PackageFormValue): UpsertPackageRequest {
  return {
    offeringId: value.offeringId,
    sessionCount: Number(value.sessionCount),
    durationMinutes: Number(value.durationMinutes),
    discountPercent: parseNumber(value.discountPercent) ?? 0,
    validDays: Number(value.validDays),
    isActive: value.isActive,
  };
}
