/**
 * Tutor package DTOs (P13-25, the tutor half of `siri_upskill_backend/docs/contracts/P13-12-tutor-packages.md` section 10).
 * If a C# record disagrees with a type here, the C# record wins: report it, do not guess.
 *
 * A package is "N one-on-one lessons of M minutes at a discount". Every price (`singleSessionPrice`, `totalPrice`,
 * `pricePerSession`, `savingsAmount`) is computed by the server's price calculator from the tutor's CURRENT hourly rate and
 * shown as-is: the client never multiplies, discounts or rounds. Only the discount, the validity period and the active flag
 * can be changed later; the number of lessons, their length and the subject cannot (create another package instead).
 */
import type { TutorCurriculum, TutorLevel } from './tutoring-public.models';
import type { Guid } from './tutoring-tutor.models';

export type { Guid };

export interface PackageOfferingRef {
  readonly offeringId: Guid;
  readonly subjectNameTh: string;
  readonly subjectNameEn: string;
  readonly level: TutorLevel;
  readonly curriculum: TutorCurriculum;
}

/**
 * One package as the public sees it (`GET tutors/{slug}/packages`, P13-12 section 5.6) - and the base of the tutor's own row. Always
 * one-on-one. Every amount is the server's: `singleSessionPrice` is the tutor's current rate for the length, `totalPrice` already has
 * the discount, `pricePerSession` is for display only and `savingsAmount` is what the discount saves. The client never recomputes them.
 */
export interface PackageOffer {
  readonly packageId: Guid;
  readonly offering: PackageOfferingRef;
  readonly sessionCount: number;
  readonly durationMinutes: number;
  readonly discountPercent: number;
  readonly validDays: number;
  readonly singleSessionPrice: number;
  readonly totalPrice: number;
  readonly pricePerSession: number;
  readonly savingsAmount: number;
  readonly currency: 'THB';
}

export interface TutorPackage extends PackageOffer {
  readonly isActive: boolean;
  readonly rowVersion: string;
}

/** Body of `POST /tutor/packages` and `PUT /tutor/packages/{id}` (an update resends the unchangeable fields as they are). */
export interface UpsertPackageRequest {
  readonly offeringId: Guid;
  readonly sessionCount: number;
  readonly durationMinutes: number;
  readonly discountPercent: number;
  readonly validDays: number;
  readonly isActive: boolean;
}
