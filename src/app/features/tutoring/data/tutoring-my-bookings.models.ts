/**
 * DTOs of the learner's "My tutoring" area (P13-23): the booking list query, the cancellation quote and cancel, the refund
 * summaries and the lesson summary. They mirror, field for field, `siri_upskill_backend/docs/contracts/` P13-05 (booking list),
 * P13-08 section 12 (cancellation / refunds) and P13-10 appendix (confirm-completed, lesson summary). If a C# record disagrees
 * with a type here, the C# record wins: report it, do not guess.
 *
 * Nothing in here is a decision. What a cancellation refunds, whether a booking can be cancelled or confirmed, and the status
 * of every refund are computed by the server; the client shows the answers and sends the learner's intent.
 */
import type { MaterialDto, MaterialDownloadResponse, RefundDisplayStatus, RefundSettlement } from './tutoring-classes.models';
import type { BookingStatus, Guid, IsoUtc } from './tutoring-learner.models';

export type { MaterialDto, MaterialDownloadResponse, RefundDisplayStatus, RefundSettlement };

/** `GET /api/tutoring/bookings/my?scope=`. The page uses `upcoming` and `past` (the History tab). */
export type BookingScope = 'upcoming' | 'past' | 'all';

export interface MyBookingsQuery {
  readonly scope: BookingScope;
  readonly status?: BookingStatus;
  readonly page: number;
  readonly pageSize: number;
}

// --- Cancellation (P13-08 sections 5.2 - 5.4) -------------------------------------------------------------------------------

/**
 * `GET bookings/{id}/cancellation-quote`: what cancelling would do RIGHT NOW, computed by the server's cancellation policy.
 * `canCancel = false` still answers `200` (it is information for the screen) with a `refusalReason` code.
 * `PendingPayment` answers `canCancel = true`, `ruleCode = "pending_payment.abandon"`, nothing to refund.
 */
export interface CancellationQuote {
  readonly bookingId: Guid;
  readonly canCancel: boolean;
  readonly refusalReason: string | null;
  readonly ruleCode: string;
  readonly amountPaid: number;
  readonly refundAmount: number;
  readonly retainedAmount: number;
  readonly refundPercent: number;
  readonly settlement: RefundSettlement;
  /** A PromptPay refund is asynchronous: Stripe contacts the buyer for bank details and it can take days. */
  readonly refundIsAsync: boolean;
  readonly startsAtUtc: IsoUtc;
  readonly quotedAtUtc: IsoUtc;
  readonly hoursUntilStart: number;
}

/** `expectedRefundAmount` is the refund the learner saw on the confirmation screen; the server refuses when the real one is lower. */
export interface CancelBookingRequest {
  readonly reason: string | null;
  readonly expectedRefundAmount: number;
}

/** What a learner is told about one refund. A `Voided` refund arrives as `Failed`; no provider ids or codes are ever exposed. */
export interface BookingRefundSummary {
  readonly refundId: Guid;
  readonly amount: number;
  readonly status: RefundDisplayStatus;
  readonly isAsync: boolean;
  readonly requestedAtUtc: IsoUtc;
  readonly completedAtUtc: IsoUtc | null;
}

export interface CancelBookingResponse {
  readonly bookingId: Guid;
  readonly status: string;
  /** `true` when this call found the booking already cancelled (a double click or a repeated request): same result, no second refund. */
  readonly alreadyCancelled: boolean;
  readonly refundAmount: number;
  readonly retainedAmount: number;
  readonly settlement: RefundSettlement;
  readonly refund: BookingRefundSummary | null;
  readonly creditRestored: boolean;
}

// --- Confirm completed + lesson summary (P13-10 appendix) ----------------------------------------------------------------------

export interface ConfirmCompletedResponse {
  readonly bookingId: Guid;
  readonly status: 'Completed';
  readonly confirmedAtUtc: IsoUtc;
}

/** `GET bookings/{id}/summary`: what the tutor wrote after the class. Plain text only. */
export interface BookingSummaryDto {
  readonly bookingId: Guid;
  readonly sessionId: Guid;
  readonly topicsCovered: string;
  readonly feedback: string | null;
  readonly homework: string | null;
  readonly nextSteps: string | null;
  readonly createdAtUtc: IsoUtc;
  readonly updatedAtUtc: IsoUtc | null;
}
