/**
 * Tutoring payment DTOs (P13-22) - mirror the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-06-tutoring-payment-and-webhook-seam.md` section 10. If a C# record disagrees with
 * a type here, the C# record wins: report it, do not guess.
 *
 * Money rules: the amount charged is the server's `booking.priceAmount` - the client never sends or recomputes it - and a
 * payment is final only when `GET payments/{id}` (fed by the signature-verified webhook) says so. A redirect, a Stripe.js
 * `confirmPayment()` result or a `redirect_status` query value is never proof of payment.
 */
import type { Guid, IsoUtc } from './tutoring-public.models';

export type TutoringPaymentMethod = 'PromptPay' | 'Card';
export type TutoringPaymentKind = 'Booking' | 'Package';
export type TutoringPaymentStatus = 'Pending' | 'Succeeded' | 'Failed' | 'Expired' | 'PartiallyRefunded' | 'Refunded';
/** How a payment that arrived outside the normal window was settled (`None` = it did not). */
export type LatePaymentResolution = 'None' | 'Reopened' | 'Refunded' | 'Duplicate' | 'Orphan';

/** `GET /api/tutoring/payments/config`. 503 `payment.provider_not_configured` when there is no publishable key. */
export interface TutoringPaymentConfig {
  readonly publishableKey: string;
  readonly enabledMethods: readonly TutoringPaymentMethod[];
}

/** Body of `POST /api/tutoring/bookings/{bookingId}/payment`. The amount is never sent. */
export interface CreateTutoringPaymentRequest {
  readonly method: TutoringPaymentMethod;
}

/**
 * Response of `POST .../payment`: 201 for a new attempt, 200 when the same pending attempt is handed back (with a fresh
 * `clientSecret` / QR). A PromptPay payment carries the QR, a card payment the `clientSecret`; the other fields are `null`.
 */
export interface TutoringPayment {
  readonly paymentId: Guid;
  readonly kind: TutoringPaymentKind;
  readonly referenceId: Guid;
  readonly attemptNo: number;
  readonly method: TutoringPaymentMethod;
  readonly amount: number;
  readonly currency: 'THB';
  readonly status: TutoringPaymentStatus;
  readonly holdExpiresAtUtc: IsoUtc | null;
  readonly clientSecret: string | null;
  readonly qrCodeUrl: string | null;
  readonly qrCodeData: string | null;
  readonly createdAtUtc: IsoUtc;
}

/**
 * `GET /api/tutoring/payments/{paymentId}` - read from the database the webhook updates. `refundedCompletedAmount` counts only
 * refunds that have completed; `refundPendingAmount` is what is reserved but not yet paid back. `lateResolution` may arrive as
 * `null` (the contract says "null means None"): read it with `lateResolutionOf`.
 */
export interface TutoringPaymentState {
  readonly paymentId: Guid;
  readonly kind: TutoringPaymentKind;
  readonly referenceId: Guid;
  readonly status: TutoringPaymentStatus;
  readonly method: TutoringPaymentMethod;
  readonly amount: number;
  readonly refundedCompletedAmount: number;
  readonly refundPendingAmount: number;
  readonly lateResolution: LatePaymentResolution | null;
  readonly bookingStatus: string | null;
  readonly updatedAtUtc: IsoUtc;
}

export function lateResolutionOf(state: Pick<TutoringPaymentState, 'lateResolution'>): LatePaymentResolution {
  return state.lateResolution ?? 'None';
}
