import type { Booking, BookingStatus, Guid, IsoUtc } from './tutoring-learner.models';
import type { PackagePurchaseSummary } from './tutoring-package-purchase.models';
import { packageStageOf } from './tutoring-package.util';
import { type TutoringPaymentState, lateResolutionOf } from './tutoring-payment.models';

/**
 * What a payment read from `GET payments/{id}` means for the checkout page:
 * - `pending`   - still waiting (the QR is unscanned / the card is being processed);
 * - `paid`      - the money arrived and the booking is confirmed (or re-opened after a late payment);
 * - `refunded`  - the money arrived too late or twice and is being / was returned in full - the booking is NOT confirmed by it;
 * - `failed`    - the attempt failed (declined card, rejected QR); a new attempt can be made while the hold lasts;
 * - `expired`   - the attempt timed out or was cancelled on the provider side.
 */
export type PaymentOutcome = 'pending' | 'paid' | 'refunded' | 'failed' | 'expired';

export function paymentOutcomeOf(state: TutoringPaymentState): PaymentOutcome {
  switch (state.status) {
    case 'Pending':
      return 'pending';
    case 'Failed':
      return 'failed';
    case 'Expired':
      return 'expired';
    case 'Succeeded':
    case 'PartiallyRefunded':
    case 'Refunded': {
      const late = lateResolutionOf(state);
      return late === 'Refunded' || late === 'Duplicate' || late === 'Orphan' ? 'refunded' : 'paid';
    }
  }
}

/** Polling can stop once the outcome is anything but `pending`. */
export const isPaymentSettled = (state: TutoringPaymentState): boolean => paymentOutcomeOf(state) !== 'pending';

/**
 * Where a booking stands as far as the checkout page is concerned:
 * - `payable`   - waiting for payment (`PendingPayment`);
 * - `confirmed` - reserved: paid or free (`Confirmed`);
 * - `ended`     - the hold ran out or the booking was cancelled - nothing left to pay;
 * - `finalized` - the lesson has already happened (completed, a no-show, or in dispute).
 */
export type BookingStage = 'payable' | 'confirmed' | 'ended' | 'finalized';

export function bookingStageOf(status: BookingStatus): BookingStage {
  switch (status) {
    case 'PendingPayment':
      return 'payable';
    case 'Confirmed':
      return 'confirmed';
    case 'Expired':
    case 'CancelledByLearner':
    case 'CancelledByTutor':
      return 'ended';
    case 'Completed':
    case 'NoShowLearner':
    case 'NoShowTutor':
    case 'NoShowBoth':
    case 'Disputed':
      return 'finalized';
  }
}

/**
 * How long after the hold deadline the page keeps listening for a payment that was already in flight. The server decides
 * such a late payment by the booking's *status*, not by the clock (it confirms when the booking is still pending), so the
 * page must not give up the instant its own countdown reaches zero.
 */
export const POST_HOLD_GRACE_MS = 90_000;

// --- What is being paid for -----------------------------------------------------------------------------------------------

/**
 * The one shape the checkout flow works with, whatever is being paid for: a held lesson (a `Booking`) or a package purchase. It
 * carries only what the flow needs - the server's amount, where it stands, the payment deadline and the clock to count it on. The
 * amount is the server's price; nothing in the client adds, multiplies or rounds it.
 */
export interface CheckoutSubject {
  readonly id: Guid;
  /** What the server will charge (a booking's `priceAmount`, a purchase's `priceSnapshot`). `0` = nothing to pay. */
  readonly amount: number;
  readonly stage: BookingStage;
  /** The payment deadline (a booking's hold, a purchase's `pendingExpiresAtUtc`); `null` once nothing is pending. */
  readonly holdExpiresAtUtc: IsoUtc | null;
  /** The server clock at response time. A purchase carries none, so its countdown runs on the browser clock (the server still decides). */
  readonly serverTimeUtc: IsoUtc | null;
  /** The payment already started for it, when the response says so (a booking does; a purchase does not). */
  readonly paymentId: Guid | null;
}

export function checkoutSubjectOfBooking(booking: Booking): CheckoutSubject {
  return {
    id: booking.bookingId,
    amount: booking.priceAmount,
    stage: bookingStageOf(booking.status),
    holdExpiresAtUtc: booking.holdExpiresAtUtc,
    serverTimeUtc: booking.serverTimeUtc,
    paymentId: booking.paymentId,
  };
}

export function checkoutSubjectOfPurchase(purchase: PackagePurchaseSummary): CheckoutSubject {
  return {
    id: purchase.purchaseId,
    amount: purchase.priceSnapshot,
    stage: packageStageOf(purchase.status),
    holdExpiresAtUtc: purchase.pendingExpiresAtUtc,
    serverTimeUtc: purchase.serverTimeUtc,
    paymentId: purchase.paymentId,
  };
}
