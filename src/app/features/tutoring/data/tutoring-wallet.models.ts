/**
 * Tutor wallet DTOs (P13-25, endpoints of P13-07 section 8) - mirror, field for field, the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-07-payout-escrow-ledger-weekly-wallet.md` (section 13). If a C# record disagrees
 * with a type here, the C# record wins: report it, do not guess.
 *
 * Every amount is the server's number in baht (two decimals). The commission, the payment-provider fee, the withholding tax,
 * the hold period and the payout date are all applied or decided by the server - the client displays them and never
 * recomputes, sums or rounds a figure.
 */
import type { Guid, IsoUtc, PagedResult } from './tutoring-tutor.models';

export type { Guid, IsoUtc, PagedResult };

export type TutoringLedgerEntryKind = 'Earning' | 'Adjustment';

/** Where one ledger row stands: held back, waiting out the dispute window, frozen by a dispute, ready, in a payout run, paid or reversed. */
export type TutoringLedgerState = 'Held' | 'InDisputeWindow' | 'Frozen' | 'Available' | 'Processing' | 'Paid' | 'Reversed';

export interface TutoringWalletSummary {
  /** Earned, not yet releasable (still inside the hold / dispute window). */
  readonly heldAmount: number;
  /** Frozen by an open dispute. */
  readonly frozenAmount: number;
  /** Ready to be paid in the next run; may be negative when a refund is netted off (carried to the next run). */
  readonly availableAmount: number;
  /** Already in a payout run that has not been paid yet. */
  readonly processingAmount: number;
  readonly paidAmount: number;
  readonly withholdingTaxPercent: number;
  /** Server estimate of what reaches the bank after withholding tax. */
  readonly estimatedNetAvailable: number;
  readonly minimumPayoutAmount: number;
  readonly meetsMinimum: boolean;
  readonly hasVerifiedPayoutAccount: boolean;
  /** An ESTIMATE of when the next run is created - an administrator still has to execute it. */
  readonly nextPayoutAtUtc: IsoUtc;
  readonly currency: 'THB';
}

export interface TutorWalletResponse {
  readonly summary: TutoringWalletSummary;
  /** The platform commission that applies to NEW bookings (old bookings keep the rate they were made under). */
  readonly commissionPercent: number;
  readonly tutorSharePercent: number;
  readonly payoutCadence: 'Weekly';
}

export type TutorLedgerSourceKind = 'Booking' | 'PackageExpiry';

export interface TutorLedgerRow {
  readonly entryId: Guid;
  readonly bookingId: Guid;
  /** `null` for a package-expiry row. */
  readonly bookingNo: string | null;
  readonly sessionStartsAtUtc: IsoUtc | null;
  readonly kind: TutoringLedgerEntryKind;
  readonly grossAmount: number;
  readonly paymentFeeAmount: number;
  readonly platformAmount: number;
  readonly tutorAmount: number;
  readonly state: TutoringLedgerState;
  /** When a held row becomes available; `null` when it has no date (frozen, paid, reversed). */
  readonly availableAtUtc: IsoUtc | null;
  readonly createdAtUtc: IsoUtc;
  readonly sourceKind: TutorLedgerSourceKind;
}

export interface TutoringPayoutHistoryItem {
  /** Also the id of the withholding-tax certificate (50 tawi) the existing payout endpoint serves. */
  readonly batchItemId: Guid;
  /** ISO week of the run, e.g. `2026-W41`. */
  readonly periodKey: string;
  readonly grossAmount: number;
  readonly withholdingTaxPercent: number;
  readonly withholdingTaxAmount: number;
  readonly netAmount: number;
  readonly status: string;
  readonly paidAtUtc: IsoUtc | null;
}
