/**
 * P11-24: resuming `/checkout/:orderId` after a Stripe 3DS full-page redirect lands the learner
 * back on this page with `?redirect_status=...` in the URL. Split out of `CheckoutPage`'s
 * constructor the same way X-28 split `playback-url-renewal.ts` out of `video-player.ts` — the
 * pending-payment-id/sessionStorage mechanics and the poll-vs-generic-resume decision are pure
 * enough to unit test in isolation, leaving `CheckoutPage` itself to only wire the result into its
 * own signals (`paymentPollStatus`, `isResumingAfterRedirect`) and existing `startPaymentPolling()`.
 *
 * `redirect_status` itself is never trusted as proof of anything except "a poll should start" —
 * the actual outcome only ever comes from `GET /commerce/payments/{id}` (security.md: never trust
 * a redirect/callback from the frontend as proof of payment). See `CardPaymentPanel.submit()`'s
 * doc comment for why the pending payment id has to survive in `sessionStorage` (not a signal) to
 * make it across the redirect at all, and why it may legitimately be missing (new tab, cleared
 * storage, private browsing) — that's the `resumeGeneric` branch below.
 */

import { PENDING_CARD_PAYMENT_ID_STORAGE_KEY } from './card-payment-panel/card-payment-panel';

export type CardPaymentResumeAction =
  | { readonly kind: 'pollPayment'; readonly paymentId: string }
  | { readonly kind: 'resumeGeneric' };

/** Decides what `CheckoutPage` should do once it's confirmed the URL carries `redirect_status`
 * (the caller's job — this function only ever runs once that's already true), given whatever
 * pending payment id `takePendingCardPaymentId()` recovered from `sessionStorage`. */
export function decideCardPaymentResumeAction(pendingPaymentId: string | null): CardPaymentResumeAction {
  if (pendingPaymentId) {
    return { kind: 'pollPayment', paymentId: pendingPaymentId };
  }
  return { kind: 'resumeGeneric' };
}

/**
 * Reads and clears the pending-payment-id `sessionStorage` key `CardPaymentPanel.submit()` writes
 * immediately before calling Stripe's `confirmPayment()`. Wrapped in try/catch — private
 * browsing/blocked storage must degrade to `null` (the `resumeGeneric` branch above), not throw
 * and break the whole resume flow, mirroring `CardPaymentPanel`'s own `sessionStorage` try/catch.
 */
export function takePendingCardPaymentId(): string | null {
  try {
    const value = sessionStorage.getItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY);
    if (value !== null) {
      sessionStorage.removeItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY);
    }
    return value;
  } catch {
    return null;
  }
}
