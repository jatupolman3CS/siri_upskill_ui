import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { Spinner } from '../../../../shared/spinner/spinner';

/**
 * `sessionStorage` key written right before `confirmPayment()` and read back by the checkout page after a 3-D Secure
 * full-page redirect (contract P13-06 section 10). Its own key - not the Commerce one - so a course checkout open in another
 * tab can never pick up (or clear) a tutoring payment id, or the other way round.
 */
export const PENDING_TUTORING_PAYMENT_STORAGE_KEY = 'siri.tutoring.checkout.pendingPaymentId';

/** Reads and clears the pending payment id; storage that is blocked (private browsing) simply yields `null`. */
export function takePendingTutoringPaymentId(): string | null {
  try {
    const value = sessionStorage.getItem(PENDING_TUTORING_PAYMENT_STORAGE_KEY);
    if (value !== null) {
      sessionStorage.removeItem(PENDING_TUTORING_PAYMENT_STORAGE_KEY);
    }
    return value;
  } catch {
    return null;
  }
}

type PanelState = 'loading' | 'ready' | 'submitting' | 'loadFailed';

/**
 * Stripe Payment Element for the card tab of `/tutoring/checkout/:bookingId` (P13-22). Same technique as Commerce's
 * `CardPaymentPanel` (that component hard-codes the Commerce storage key and `checkout.card.*` texts, so it cannot be reused
 * without editing Commerce): `@stripe/stripe-js` is imported lazily inside `afterNextRender` so it never reaches the initial
 * bundle, and the element container stays in the DOM (`[hidden]`) because Stripe mounts into it exactly once.
 * <para>
 * `confirmPayment()` resolving without an error is NOT a payment result - 3-D Secure may still redirect away, and the final
 * outcome only ever comes from `GET payments/{id}` (fed by the signed webhook). This panel only reports "confirm finished".
 * </para>
 */
@Component({
  selector: 'app-tutoring-card-panel',
  imports: [TranslatePipe, Button, Skeleton, Spinner, NgIcon],
  templateUrl: './tutoring-card-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorWarningCircle })],
})
export class TutoringCardPanel {
  readonly clientSecret = input.required<string>();
  readonly paymentId = input.required<string>();
  readonly publishableKey = input.required<string>();
  readonly returnUrl = input.required<string>();

  /** An i18n key (`tutoring.checkout.card.loadFailed`) or the user-safe message Stripe.js itself returned. */
  readonly paymentError = output<string>();
  /** `confirmPayment()` finished without an error and without leaving the page; the caller must start polling. */
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
    const container = this.elementContainer();
    if (!stripe || !container) {
      this.state.set('loadFailed');
      this.paymentError.emit('tutoring.checkout.card.loadFailed');
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

    // Written BEFORE confirmPayment(): a 3-D Secure redirect can happen synchronously inside that call and destroys this app.
    try {
      sessionStorage.setItem(PENDING_TUTORING_PAYMENT_STORAGE_KEY, this.paymentId());
    } catch {
      // Blocked storage only degrades the resume after the redirect (the checkout falls back to the booking's own payment id).
    }

    const result = await stripe.confirmPayment({
      elements,
      clientSecret: this.clientSecret(),
      confirmParams: { return_url: this.returnUrl() },
      redirect: 'if_required',
    });

    if (result.error) {
      this.state.set('ready');
      this.paymentError.emit(result.error.message ?? 'tutoring.checkout.card.loadFailed');
      return;
    }
    this.confirmedInline.emit();
  }
}
