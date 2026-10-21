/**
 * Learner-side Tutor Marketplace DTOs (P13-22): learner profiles, the booking (hold) and the cancellation policy shown
 * before booking. They mirror, field for field, the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-05-learner-profiles-and-booking-core.md` (profiles + `Booking`) and
 * `P13-08-cancellation-refund-noshow-engine.md` section 12 (`CancellationPolicy`). If a C# record disagrees with a type
 * here, the C# record wins: report it, do not guess.
 *
 * Everything the server decides stays server-side: the price of a booking (`priceAmount`), whether a slot is still free, the
 * hold deadline and the status. The client only displays these values and never recomputes them.
 */
import type { Guid, IsoUtc, SessionFormat, TutorCurriculum, TutorLevel } from './tutoring-public.models';

export type { Guid, IsoUtc };

export type LearnerGrade =
  | 'Primary1'
  | 'Primary2'
  | 'Primary3'
  | 'Primary4'
  | 'Primary5'
  | 'Primary6'
  | 'Secondary1'
  | 'Secondary2'
  | 'Secondary3'
  | 'Secondary4'
  | 'Secondary5'
  | 'Secondary6'
  | 'Vocational'
  | 'University'
  | 'Adult'
  | 'Other';

export type BookingStatus =
  | 'PendingPayment'
  | 'Confirmed'
  | 'CancelledByLearner'
  | 'CancelledByTutor'
  | 'Completed'
  | 'NoShowLearner'
  | 'NoShowTutor'
  | 'NoShowBoth'
  | 'Disputed'
  | 'Expired';

// --- Learner profiles (P13-05 section 4) ------------------------------------------------------------------------------

/**
 * Body of `POST` / `PUT /api/tutoring/learner-profiles`. A learner is a nickname + school grade only (no real name, birth
 * date, school or contact). `guardianConsent` must be `true` for a minor and `guardianConsentVersion` must equal the version
 * the server currently requires; the server stamps the consent time itself.
 */
export interface UpsertLearnerProfileRequest {
  readonly nickname: string;
  readonly gradeLevel: LearnerGrade;
  readonly isMinor: boolean;
  readonly guardianConsent: boolean;
  readonly guardianConsentVersion?: string | null;
}

export interface LearnerProfile {
  readonly learnerProfileId: Guid;
  readonly nickname: string;
  readonly gradeLevel: LearnerGrade;
  readonly isMinor: boolean;
  readonly guardianConsentAtUtc: IsoUtc | null;
  readonly guardianConsentVersion: string | null;
  readonly isActive: boolean;
  readonly anonymizedAtUtc?: IsoUtc | null;
  readonly guardianConsentWithdrawnAtUtc?: IsoUtc | null;
}

/** Body of `POST /api/tutoring/learner-profiles/{id}/withdraw-consent` (P13-17). */
export interface WithdrawGuardianConsentRequest {
  readonly confirmation: 'WITHDRAW';
}

export interface GuardianConsentWithdrawalResponse {
  readonly learnerProfileId: Guid;
  readonly withdrawnAtUtc: IsoUtc;
}

// --- Booking (P13-05 sections 5-6 and the "Booking - merged" appendix) ------------------------------------------------

/** Body of `POST /api/tutoring/bookings`. No price, tutor, session or user id: the server derives all of them. */
export interface CreateBookingRequest {
  readonly offeringId: Guid;
  readonly startsAtUtc: IsoUtc;
  readonly durationMinutes: number;
  readonly format: SessionFormat;
  readonly learnerProfileId: Guid;
  readonly isTrial: boolean;
}

export interface BookingTutorSummary {
  readonly slug: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
}

export interface BookingOfferingSummary {
  readonly offeringId: Guid;
  readonly subjectNameTh: string;
  readonly subjectNameEn: string;
  readonly level: TutorLevel;
  readonly curriculum: TutorCurriculum;
}

export interface BookingLearnerSummary {
  readonly learnerProfileId: Guid;
  readonly nickname: string;
  readonly gradeLevel: LearnerGrade;
  readonly guardianConsentWithdrawnAtUtc?: IsoUtc | null;
}

/**
 * The merged `Booking` DTO. `priceAmount` is the server's price (0 = a free trial that is already `Confirmed`);
 * `holdExpiresAtUtc` is only set while `PendingPayment`; `serverTimeUtc` is the server clock at response time, used to
 * correct the browser clock when counting the hold down. `canJoin` / `joinOpensAtUtc` are display hints only.
 */
export interface Booking {
  readonly bookingId: Guid;
  /**
   * The class (session) the booking belongs to (P13-05 revision 3). `POST /sessions/{sessionId}/join`, the class materials and
   * `tutor-present` (P13-09 / P13-10) are all addressed by it - not by the booking id.
   */
  readonly sessionId: Guid;
  readonly bookingNo: string;
  readonly status: BookingStatus;
  readonly isTrial: boolean;
  readonly format: SessionFormat;
  readonly priceAmount: number;
  readonly currency: 'THB';
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly durationMinutes: number;
  readonly tutor: BookingTutorSummary;
  readonly offering: BookingOfferingSummary;
  readonly learner: BookingLearnerSummary;
  readonly holdExpiresAtUtc: IsoUtc | null;
  readonly requiresPayment: boolean;
  readonly paymentId: Guid | null;
  readonly refundedAmount: number;
  readonly confirmedAtUtc: IsoUtc | null;
  readonly createdAtUtc: IsoUtc;
  readonly serverTimeUtc: IsoUtc;
  readonly packagePurchaseId: Guid | null;
  readonly joinOpensAtUtc: IsoUtc | null;
  readonly canJoin: boolean;
  /**
   * Added by later contracts as optional, additive fields (P13-README sections 6 and 8.3): `attendance` by P13-10 (only on
   * `GET bookings/my` and `GET bookings/{id}`), `disputeId` / `disputeWindowEndsAtUtc` by P13-14.
   */
  readonly attendance?: BookingAttendance | null;
  readonly disputeId?: Guid | null;
  readonly disputeWindowEndsAtUtc?: IsoUtc | null;
}

/** `Booking.attendance` (P13-10 appendix): display hints only - the rights are decided by the POST endpoints. */
export interface BookingAttendance {
  readonly learnerJoinedAtUtc: IsoUtc | null;
  readonly tutorPresentAttested: boolean;
  readonly confirmedCompletedAtUtc: IsoUtc | null;
  readonly canConfirmCompleted: boolean;
}

/**
 * One row of `GET /api/tutoring/bookings/my` (P13-05 appendix): `Pick<Booking, ...>` plus the additive fields above. `sessionId` (join /
 * materials) and `refundedAmount` (Requested + Processing + Completed refunds, so a card shows the refund without a call per booking)
 * are on the list item as well as on the single booking since P13-05 revision 3.
 */
export type BookingListItem = Pick<
  Booking,
  | 'bookingId'
  | 'bookingNo'
  | 'status'
  | 'isTrial'
  | 'format'
  | 'priceAmount'
  | 'currency'
  | 'startsAtUtc'
  | 'endsAtUtc'
  | 'durationMinutes'
  | 'tutor'
  | 'offering'
  | 'learner'
  | 'holdExpiresAtUtc'
  | 'requiresPayment'
  | 'packagePurchaseId'
  | 'joinOpensAtUtc'
  | 'canJoin'
  | 'serverTimeUtc'
  | 'attendance'
  | 'disputeId'
  | 'disputeWindowEndsAtUtc'
  | 'sessionId'
  | 'refundedAmount'
>;

// --- Cancellation policy (P13-08 section 5.1) -------------------------------------------------------------------------

/** `GET /api/tutoring/cancellation-policy` (public). The numbers come from server configuration; none is hard-coded here. */
export interface CancellationPolicy {
  readonly fullRefundHours: number;
  readonly fullRefundPercent: number;
  readonly lateRefundPercent: number;
  readonly tutorCancelRefundPercent: number;
  readonly tutorNoShowRefundPercent: number;
  readonly learnerNoShowRefundPercent: number;
  readonly disputeWindowHours: number;
}
