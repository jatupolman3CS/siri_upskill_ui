import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { Spinner } from '../../../../shared/spinner/spinner';

/**
 * `sessionStorage` key this panel writes to right before calling `confirmPayment` and that
 * `CheckoutPage` reads back on the next page load to resume after a 3DS full-page redirect —
 * see this component's own doc comment and `docs/contracts/P11-09-card-payment.md` §4.3 for why
 * `sessionStorage`, not signal/component state, is the only place this can survive that redirect.
 */
export const PENDING_CARD_PAYMENT_ID_STORAGE_KEY = 'siri.checkout.pendingPaymentId';

type PanelState = 'loading' | 'ready' | 'submitting' | 'loadFailed';

/**
 * Stripe Payment Element panel for the Card tab of `/checkout/:orderId` (`P11-24`, contract
 * `P11-09-card-payment.md` §4.2). Split out of `CheckoutPage` itself (already near
 * frontend.md's ~200-line guideline before this) and `@defer`-loaded from the host template so
 * `@stripe/stripe-js` never lands in the initial bundle for learners who never touch Card.
 * <para>
 * <b>Why `loadStripe` is called from inside `afterNextRender`, not the constructor body
 * directly</b> — per frontend.md's SSR rule, DOM mounting (`elements.create(...).mount(...)`) is a
 * browser-only operation; `afterNextRender` also happens to be exactly where this codebase already
 * puts other "real browser only, exactly once" side effects (see `ConfirmEmailPage`).
 * </para>
 * <para>
 * <b>Why the pending-payment id is written to `sessionStorage` here, inside `submit()`, rather
 * than by the parent before this component even mounts</b> — the contract's flow is specific:
 * the write must happen immediately before `confirmPayment` is called, not merely while the panel
 * is visible, because a full-page 3DS redirect can happen synchronously inside that call and
 * destroys this Angular app instance before any code after the write (including code in the
 * parent) gets a chance to run. `paymentId` is passed in as an input rather than read off
 * `clientSecret` (which is not the same value and cannot be parsed back into it) because this
 * panel has no access to `CheckoutPage`'s own `payment()` signal.
 * </para>
 */
@Component({
  selector: 'app-card-payment-panel',
  imports: [TranslatePipe, Button, Skeleton, Spinner, NgIcon],
  templateUrl: './card-payment-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorWarningCircle })],
})
export class CardPaymentPanel {
  readonly clientSecret = input.required<string>();
  readonly paymentId = input.required<string>();
  readonly publishableKey = input.required<string>();
  readonly returnUrl = input.required<string>();

  /** Inline confirm error message — either an i18n key (`checkout.card.loadFailed`) or the raw
   * `error.message` Stripe.js gives back, which is already safe to show a user as-is per Stripe's
   * own contract. `CheckoutPage` resolves it through `TranslationService.t()`, which harmlessly
   * returns an unrecognized (non-dictionary-key) string unchanged — see that service's own
   * "returns the key itself when not found" behavior. Never emitted for a final success/failure —
   * that determination belongs to `GET /commerce/payments/{id}` polling alone (security.md). */
  readonly paymentError = output<string>();
  /** `confirmPayment()` resolved with no error and without leaving the page (no 3DS full-page
   * redirect happened) — NOT a signal of payment success by itself. The parent must still fall
   * back to its existing `startPaymentPolling()` against the real payment status. */
  readonly confirmedInline = output<void>();

  private readonly elementContainer = viewChild<ElementRef<HTMLDivElement>>('cardElementContainer');

  protected readonly state = signal<PanelState>('loading');
  protected readonly isSubmitting = computed(() => this.state() === 'submitting');
  protected readonly isReady = computed(() => this.state() === 'ready' || this.state() === 'submitting');

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripePaymentElement | null = null;

  constructor() {
    afterNextRender(() => {
      void this.initializeStripe();
    });
  }

  private async initializeStripe(): Promise<void> {
    const { loadStripe } = await import('@stripe/stripe-js');
    let stripe: Stripe | null;
    try {
      stripe = await loadStripe(this.publishableKey());
    } catch {
      stripe = null;
    }

    if (!stripe) {
      this.state.set('loadFailed');
      this.paymentError.emit('checkout.card.loadFailed');
      return;
    }

    const container = this.elementContainer();
    if (!container) {
      // Host view was torn down (navigated away) before the async Stripe.js load resolved.
      this.state.set('loadFailed');
      return;
    }

    this.stripe = stripe;
    this.elements = stripe.elements({ clientSecret: this.clientSecret() });
    this.paymentElement = this.elements.create('payment');
    this.paymentElement.mount(container.nativeElement);
    this.state.set('ready');
  }

  protected async submit(): Promise<void> {
    const stripe = this.stripe;
    const elements = this.elements;
    if (!stripe || !elements || this.state() !== 'ready') {
      return;
    }

    this.state.set('submitting');

    // Must be written BEFORE confirmPayment(), not after — a full-page 3DS redirect can happen
    // synchronously inside that call, and this component (and the whole Angular app instance)
    // is gone before any statement after the call would run. See this file's class doc comment.
    try {
      sessionStorage.setItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY, this.paymentId());
    } catch {
      // Private-browsing/blocked storage — not fatal here; it only degrades the post-3DS-redirect
      // resume experience (CheckoutPage falls back to its generic "checking status" state), it
      // does not affect whether the payment itself can succeed.
    }

    const result = await stripe.confirmPayment({
      elements,
      clientSecret: this.clientSecret(),
      confirmParams: { return_url: this.returnUrl() },
      redirect: 'if_required',
    });

    if (result.error) {
      this.state.set('ready');
      this.paymentError.emit(result.error.message ?? 'checkout.card.loadFailed');
      return;
    }

    // Resolved with no error and we're still here (no full-page redirect occurred) — the payment
    // may or may not have actually succeeded yet; only the poll against GET /payments/{id} decides
    // that (security.md: never trust a client-side confirm as the final answer).
    this.confirmedInline.emit();
  }
}
