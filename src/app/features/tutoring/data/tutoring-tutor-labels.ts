import type { SessionStatus, MaterialKind, RefundDisplayStatus, RefundSettlement, TutorPenaltyKind } from './tutoring-classes.models';
import type { KycCaseStatus, KycDocumentStatus, KycDocumentType } from './tutoring-kyc.models';
import type { TutorStatus } from './tutoring-tutor.models';
import type { TutorLedgerSourceKind, TutoringLedgerEntryKind, TutoringLedgerState } from './tutoring-wallet.models';

/**
 * Closed enums of the Tutor Portal and the i18n keys that label them. The keys are built at runtime (so `i18n-guard.spec`
 * cannot see them); `tutoring-tutor-labels.spec.ts` asserts every value resolves in both dictionaries.
 */
export const TUTOR_STATUSES: readonly TutorStatus[] = ['Draft', 'PendingVerification', 'NeedsInfo', 'Verified', 'Rejected', 'Suspended'];
export const KYC_CASE_STATUSES: readonly KycCaseStatus[] = ['Draft', 'Submitted', 'InReview', 'NeedsInfo', 'Approved', 'Rejected'];
export const KYC_DOCUMENT_TYPES: readonly KycDocumentType[] = ['IdCard', 'Diploma', 'CriminalRecord', 'Certificate', 'Other'];
export const KYC_DOCUMENT_STATUSES: readonly KycDocumentStatus[] = ['Pending', 'Approved', 'Rejected'];

/** Readiness blocker codes the contract documents (P13-01 section 5.3.6, P13-02 section 10); each has a `tutoring.tutor.readiness.*` text. */
export const READINESS_BLOCKERS: readonly string[] = [
  'display_name_missing',
  'headline_missing',
  'bio_too_short',
  'no_active_offering',
  'photo_missing',
  'kyc_case_missing',
  'kyc_documents_missing',
];

export const tutorStatusLabelKey = (status: TutorStatus): string => `tutoring.enums.tutorStatus.${status}`;
export const kycCaseStatusLabelKey = (status: KycCaseStatus): string => `tutoring.enums.kycCaseStatus.${status}`;
export const kycDocumentTypeLabelKey = (type: KycDocumentType): string => `tutoring.enums.kycDocumentType.${type}`;
export const kycDocumentStatusLabelKey = (status: KycDocumentStatus): string => `tutoring.enums.kycDocumentStatus.${status}`;

/** The text of a readiness blocker; a code the client does not know yet degrades to a generic line instead of leaking the code. */
export function readinessBlockerKey(code: string): string {
  return READINESS_BLOCKERS.includes(code) ? `tutoring.tutor.readiness.${code}` : 'tutoring.tutor.readiness.unknown';
}

/** Where a blocker is fixed in the portal. */
export function readinessBlockerRoute(code: string): string {
  switch (code) {
    case 'no_active_offering':
      return '/instructor/tutoring/offerings';
    case 'kyc_case_missing':
    case 'kyc_documents_missing':
      return '/instructor/tutoring/kyc';
    default:
      return '/instructor/tutoring/profile';
  }
}

/** `tone-*` class of a status chip (hue comes from `tokens.css`; never a raw palette class). */
export function tutorStatusTone(status: TutorStatus): string {
  switch (status) {
    case 'Verified':
      return 'tone-green';
    case 'PendingVerification':
      return 'tone-blue';
    case 'NeedsInfo':
      return 'tone-gold';
    case 'Rejected':
    case 'Suspended':
      return 'tone-red';
    default:
      return '';
  }
}

export function kycDocumentStatusTone(status: KycDocumentStatus): string {
  switch (status) {
    case 'Approved':
      return 'tone-green';
    case 'Rejected':
      return 'tone-red';
    default:
      return 'tone-blue';
  }
}

// --- Classes, wallet and cancellation (P13-25) ---------------------------------------------------------------------------------

export const SESSION_STATUSES: readonly SessionStatus[] = ['Held', 'Scheduled', 'Cancelled', 'Completed', 'NoShowTutor', 'NoShowBoth'];
export const LEDGER_STATES: readonly TutoringLedgerState[] = ['Held', 'InDisputeWindow', 'Frozen', 'Available', 'Processing', 'Paid', 'Reversed'];
export const LEDGER_KINDS: readonly TutoringLedgerEntryKind[] = ['Earning', 'Adjustment'];
export const LEDGER_SOURCE_KINDS: readonly TutorLedgerSourceKind[] = ['Booking', 'PackageExpiry'];
export const MATERIAL_KINDS: readonly MaterialKind[] = ['Link', 'Homework', 'File'];
export const PENALTY_KINDS: readonly TutorPenaltyKind[] = ['LateCancel', 'NoShow'];
export const REFUND_SETTLEMENTS: readonly RefundSettlement[] = ['None', 'Money', 'CreditRestore'];
export const REFUND_DISPLAY_STATUSES: readonly RefundDisplayStatus[] = ['Requested', 'Processing', 'Completed', 'Failed'];
export const REFUND_REASONS = [
  'LearnerCancelEarly',
  'LearnerCancelLate',
  'TutorCancel',
  'TutorNoShow',
  'NoClassHeld',
  'DisputeResolved',
  'AdminManual',
  'LatePayment',
  'DuplicatePayment',
  'AmountMismatch',
  'PackageExpired',
  'ConsentWithdrawn',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const sessionStatusLabelKey = (status: SessionStatus): string => `tutoring.enums.sessionStatus.${status}`;
export const ledgerStateLabelKey = (state: TutoringLedgerState): string => `tutoring.enums.ledgerState.${state}`;
export const ledgerKindLabelKey = (kind: TutoringLedgerEntryKind): string => `tutoring.enums.ledgerKind.${kind}`;
export const ledgerSourceLabelKey = (kind: TutorLedgerSourceKind): string => `tutoring.enums.ledgerSource.${kind}`;
export const materialKindLabelKey = (kind: MaterialKind): string => `tutoring.enums.materialKind.${kind}`;
export const penaltyKindLabelKey = (kind: TutorPenaltyKind): string => `tutoring.enums.penaltyKind.${kind}`;
export const refundSettlementLabelKey = (settlement: RefundSettlement): string => `tutoring.enums.refundSettlement.${settlement}`;
export const refundStatusLabelKey = (status: RefundDisplayStatus): string => `tutoring.enums.refundStatus.${status}`;
export const refundReasonLabelKey = (reason: string): string =>
  (REFUND_REASONS as readonly string[]).includes(reason)
    ? `tutoring.enums.refundReason.${reason}`
    : 'tutoring.enums.refundReason.unknown';

/** Label of a learner's booking status inside a class; a status this client does not know yet degrades to a generic line. */
export function bookingStatusKeyOf(status: string): string {
  return (BOOKING_STATUS_VALUES as readonly string[]).includes(status) ? `tutoring.enums.bookingStatus.${status}` : 'tutoring.enums.bookingStatus.unknown';
}

const BOOKING_STATUS_VALUES: readonly string[] = [
  'PendingPayment',
  'Confirmed',
  'CancelledByLearner',
  'CancelledByTutor',
  'Completed',
  'NoShowLearner',
  'NoShowTutor',
  'NoShowBoth',
  'Disputed',
  'Expired',
];

/** `tone-*` class of a ledger-state chip. */
export function ledgerStateTone(state: TutoringLedgerState): string {
  switch (state) {
    case 'Available':
    case 'Paid':
      return 'tone-green';
    case 'Held':
    case 'InDisputeWindow':
    case 'Processing':
      return 'tone-blue';
    case 'Frozen':
      return 'tone-gold';
    default:
      return '';
  }
}
