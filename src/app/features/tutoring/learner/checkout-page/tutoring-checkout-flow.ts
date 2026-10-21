import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';

import { ApiError } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { type PaymentPollerConfig, startPaymentPolling } from '../../data/payment-status-poller';
import { holdRemainingMs, serverClockOffsetMs } from '../../data/tutoring-booking.util';
import {
  type CheckoutSubject,
  POST_HOLD_GRACE_MS,
  type PaymentOutcome,
  checkoutSubjectOfBooking,
  checkoutSubjectOfPurchase,
  isPaymentSettled,
  paymentOutcomeOf,
} from '../../data/tutoring-checkout.util';
import { tutoringErrorKey, tutoringReasonOf } from '../../data/tutoring-errors';
import { TutoringLearnerApiService } from '../../data/tutoring-learner-api.service';
import type { Booking } from '../../data/tutoring-learner.models';
import { TutoringPackagePurchaseApiService } from '../../data/tutoring-package-purchase-api.service';
import type { PackagePurchaseDetail } from '../../data/tutoring-package-purchase.models';
import { TutoringPaymentApiService } from '../../data/tutoring-payment-api.service';
import type { TutoringPayment, TutoringPaymentKind, TutoringPaymentMethod, TutoringPaymentState } from '../../data/tutoring-payment.models';
import { takePendingTutoringPaymentId } from '../../ui/tutoring-card-panel/tutoring-card-panel';

/** What the checkout page shows. Every value is derived from server data (booking, payment state) plus the hold clock. */
export type CheckoutView =
  | 'loading'
  | 'notFound'
  | 'error'
  | 'confirmed'
  | 'refunded'
  | 'ended'
  | 'finalized'
  | 'verifying'
  | 'processing'
  | 'choose'
  | 'promptpay'
  | 'card';

/**
 * State and orchestration of `/tutoring/checkout/:bookingId`, provided by the page (one instance per visit).
 * <para>
 * Nothing here decides money. The booking (`priceAmount`, `status`, `holdExpiresAtUtc`) and the payment state both come from
 * the server; a payment counts as done only when `GET payments/{id}` says so, never because Stripe.js returned or the URL
 * says `redirect_status=succeeded`. The hold countdown runs on the server clock (`serverTimeUtc` offset).
 * </para>
 * <para>
 * The same flow serves both things a person can pay for here: a held lesson (`kind = 'Booking'`, `/tutoring/checkout/:bookingId`) and a package
 * purchase (`kind = 'Package'`, `/tutoring/checkout/package/:purchaseId`). Both are reduced to one {@link CheckoutSubject} (the server's amount, stage and
 * payment deadline); only the two reads and the call that starts a payment differ. A purchase carries no payment id and no server clock, so a reload
 * starts at choosing a method again (the server hands the same pending attempt back) and its countdown uses the browser clock.
 * </para>
 * <para>
 * A reload is safe: a booking that already has a payment is resumed (a pending attempt of the same method is handed back by
 * the server with a fresh QR / client secret; after a 3-D Secure redirect the payment id kept in `sessionStorage`, else the
 * booking's own, is polled). After the hold deadline the page keeps listening for a short grace period, because the server
 * confirms a payment that was already in flight by the booking's *status*, not by the clock.
 * </para>
 */
@Injectable()
export class TutoringCheckoutFlow {
  private readonly bookings = inject(TutoringLearnerApiService);
  private readonly packages = inject(TutoringPackagePurchaseApiService);
  private readonly payments = inject(TutoringPaymentApiService);
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(TranslationService);

  /** What is being paid for. Set once by {@link init}; a booking unless the page says otherwise. */
  readonly kind = signal<TutoringPaymentKind>('Booking');
  /** The booking id or the purchase id, per {@link kind}. */
  readonly subjectId = signal('');
  private returnedFromRedirect = false;

  private readonly bookingResource = rxResource({
    params: () => (this.kind() === 'Booking' ? this.subjectId() || undefined : undefined),
    stream: ({ params }) => this.bookings.getBooking(params),
  });
  private readonly purchaseResource = rxResource({
    params: () => (this.kind() === 'Package' ? this.subjectId() || undefined : undefined),
    stream: ({ params }) => this.packages.getPurchase(params),
  });
  readonly booking = computed<Booking | undefined>(() => (this.bookingResource.hasValue() ? this.bookingResource.value() : undefined));
  readonly purchase = computed<PackagePurchaseDetail | undefined>(() => (this.purchaseResource.hasValue() ? this.purchaseResource.value() : undefined));
  /** The thing being paid for, reduced to what the flow needs; `undefined` until its first read arrives. */
  readonly subject = computed<CheckoutSubject | undefined>(() => {
    const booking = this.booking();
    if (booking !== undefined) {
      return checkoutSubjectOfBooking(booking);
    }
    const purchase = this.purchase();
    return purchase === undefined ? undefined : checkoutSubjectOfPurchase(purchase);
  });
  private readonly subjectError = computed(() => (this.kind() === 'Package' ? this.purchaseResource.error() : this.bookingResource.error()) as ApiError | undefined);
  private readonly stage = computed(() => this.subject()?.stage);
  /** The amount the server will charge, for the pay button; `0` while nothing is loaded. */
  readonly amount = computed(() => this.subject()?.amount ?? 0);
  private readonly needsPayment = computed(() => this.stage() === 'payable' && this.amount() > 0);

  private readonly configResource = rxResource({
    params: () => (this.needsPayment() ? true : undefined),
    stream: () => this.payments.getPaymentConfig(),
  });
  readonly config = computed(() => (this.configResource.hasValue() ? this.configResource.value() : undefined));
  readonly configFailed = computed(() => this.configResource.status() === 'error');
  readonly enabledMethods = computed<readonly TutoringPaymentMethod[]>(() => this.config()?.enabledMethods ?? []);

  readonly method = signal<TutoringPaymentMethod>('PromptPay');
  /** The attempt whose QR / client secret is on screen. */
  readonly payment = signal<TutoringPayment | null>(null);
  readonly creating = signal(false);
  readonly problem = signal<string | null>(null);
  /** The last state read for the payment; drives the refund wording of the late-payment view. */
  readonly paymentState = signal<TutoringPaymentState | null>(null);
  private readonly outcome = signal<PaymentOutcome | null>(null);
  private readonly resuming = signal(false);
  /** A card was submitted (or we came back from a redirect): wait for the webhook-fed state instead of showing the form. */
  private readonly awaitingResult = signal(false);
  readonly pollingGaveUp = signal(false);
  private readonly polling = signal(false);
  private stopPolling: (() => void) | null = null;
  private resumed = false;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  // --- Hold clock (server time) ---------------------------------------------------------------------------------------
  private readonly nowMs = signal(Date.now());
  private readonly clockOffsetMs = signal(0);
  readonly remainingMs = computed(() => holdRemainingMs(this.subject()?.holdExpiresAtUtc ?? null, this.nowMs(), this.clockOffsetMs()));
  readonly holdOver = computed(() => this.remainingMs() === 0);
  private readonly pastHoldMs = computed(() => {
    const hold = this.subject()?.holdExpiresAtUtc;
    return hold ? this.nowMs() + this.clockOffsetMs() - Date.parse(hold) : 0;
  });

  readonly view = computed<CheckoutView>(() => {
    if (this.subject() === undefined) {
      const status = this.subjectError()?.status;
      return status === undefined ? 'loading' : status === 404 ? 'notFound' : 'error';
    }
    if (this.outcome() === 'refunded') {
      return 'refunded';
    }
    switch (this.stage()) {
      case 'confirmed':
        return 'confirmed';
      case 'finalized':
        return 'finalized';
      case 'ended':
        return 'ended';
      default:
        break;
    }
    if (this.outcome() === 'paid') {
      return 'processing';
    }
    if (this.holdOver()) {
      return this.polling() && this.pastHoldMs() < POST_HOLD_GRACE_MS ? 'verifying' : 'ended';
    }
    if (this.resuming() || this.awaitingResult()) {
      return 'processing';
    }
    const payment = this.payment();
    if (payment === null) {
      return 'choose';
    }
    return payment.method === 'PromptPay' ? 'promptpay' : 'card';
  });
  readonly paidAwaitingBooking = computed(() => this.outcome() === 'paid');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopPolling?.();
      if (this.clockTimer !== null) {
        clearInterval(this.clockTimer);
      }
    });

    // Re-anchor the hold clock to the server every time the booking is (re)read.
    effect(() => {
      const subject = this.subject();
      if (subject !== undefined) {
        untracked(() => {
          const browserNow = Date.now();
          this.nowMs.set(browserNow);
          this.clockOffsetMs.set(subject.serverTimeUtc === null ? 0 : serverClockOffsetMs(subject.serverTimeUtc, browserNow));
        });
      }
    });

    // PromptPay is the default; when the server only offers something else, start from what is on offer.
    effect(() => {
      const methods = this.enabledMethods();
      const current = untracked(() => this.method());
      if (methods.length > 0 && !methods.includes(current)) {
        untracked(() => this.method.set(methods[0]));
      }
    });

    // Resume once, as soon as the booking is known to be waiting for payment.
    effect(() => {
      const subject = this.subject();
      if (subject !== undefined && this.needsPayment() && !this.resumed) {
        this.resumed = true;
        untracked(() => this.resume(subject));
      }
    });
  }

  /** Call once the page has the route values. Browser only for the timer part (`startClock`). */
  init(subjectId: string, returnedFromRedirect: boolean, kind: TutoringPaymentKind = 'Booking'): void {
    this.returnedFromRedirect = returnedFromRedirect;
    this.kind.set(kind);
    this.subjectId.set(subjectId);
  }

  /** Ticks the hold clock once a second. Call from `afterNextRender` so the server never schedules a timer. */
  startClock(): void {
    if (this.clockTimer === null) {
      this.clockTimer = setInterval(() => this.nowMs.set(Date.now()), 1_000);
    }
  }

  /** Reads the booking / purchase again (after a payment, a refusal that changed it, or a failed first read). */
  reloadSubject(): void {
    if (this.kind() === 'Package') {
      this.purchaseResource.reload();
    } else {
      this.bookingResource.reload();
    }
  }

  reloadConfig(): void {
    this.configResource.reload();
  }

  chooseMethod(method: TutoringPaymentMethod): void {
    this.method.set(method);
  }

  /** Starts a payment attempt with the chosen method (the server charges the booking's price; no amount is sent). */
  pay(): void {
    const subject = this.subject();
    if (subject === undefined || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.problem.set(null);
    this.startPayment(subject.id, this.method()).subscribe({
      next: (payment) => {
        this.creating.set(false);
        this.activate(payment);
      },
      error: (error: unknown) => {
        this.creating.set(false);
        this.onPaymentRefused(error, subject);
      },
    });
  }

  /** The card panel finished `confirmPayment()` without leaving the page: wait for the signed webhook's verdict. */
  onCardConfirmedInline(): void {
    const payment = this.payment();
    if (payment !== null) {
      this.awaitingResult.set(true);
      this.listenTo(payment.paymentId, true);
    }
  }

  onCardError(message: string): void {
    this.problem.set(this.i18n.t(message));
  }

  /** After a failed or expired attempt: back to choosing a method for another try (while the hold lasts). */
  tryAgain(): void {
    this.endPolling();
    this.payment.set(null);
    this.outcome.set(null);
    this.awaitingResult.set(false);
    this.pollingGaveUp.set(false);
  }

  /** Manual refresh when polling stopped or the booking has not flipped yet. */
  refresh(): void {
    this.pollingGaveUp.set(false);
    this.problem.set(null);
    const id = this.payment()?.paymentId ?? this.subject()?.paymentId ?? null;
    this.reloadSubject();
    if (id !== null && this.outcome() !== 'paid') {
      this.listenTo(id, true);
    }
  }

  // --- Internals ------------------------------------------------------------------------------------------------------

  private activate(payment: TutoringPayment): void {
    this.endPolling();
    const usable = payment.method === 'PromptPay' ? payment.qrCodeUrl !== null : payment.clientSecret !== null;
    if (!usable) {
      this.problem.set(this.i18n.t('tutoring.checkout.createFailed'));
      return;
    }
    this.payment.set(payment);
    this.outcome.set(null);
    this.pollingGaveUp.set(false);
    if (payment.method === 'PromptPay') {
      this.listenTo(payment.paymentId, false);
    }
  }

  /** The call that starts (or hands back) a payment attempt for what is being paid for. */
  private startPayment(subjectId: string, method: TutoringPaymentMethod): Observable<TutoringPayment> {
    return this.kind() === 'Package' ? this.payments.createPackagePayment(subjectId, method) : this.payments.createPayment(subjectId, method);
  }

  private onPaymentRefused(error: unknown, subject: CheckoutSubject): void {
    const reason = tutoringReasonOf(error);
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
    switch (reason) {
      case 'tutoring.hold_expired':
      case 'tutoring.booking_not_payable':
      case 'tutoring.booking_is_free':
      case 'tutoring.booking_already_paid':
      case 'tutoring.package_purchase_expired':
      case 'tutoring.already_paid':
        this.reloadSubject();
        break;
      case 'tutoring.payment_method_disabled':
        this.reloadConfig();
        break;
      case 'tutoring.payment_in_progress':
        // The previous attempt is already being processed: follow it instead of starting another.
        if (subject.paymentId !== null) {
          this.problem.set(null);
          this.awaitingResult.set(true);
          this.listenTo(subject.paymentId, true);
        } else {
          this.reloadSubject();
        }
        break;
      default:
        break;
    }
  }

  private resume(subject: CheckoutSubject): void {
    const pendingId = this.returnedFromRedirect ? takePendingTutoringPaymentId() : null;
    const paymentId = pendingId ?? subject.paymentId;
    if (paymentId === null) {
      return;
    }
    this.resuming.set(true);
    this.payments.getPaymentState(paymentId).subscribe({
      next: (state) => {
        if (state.referenceId === subject.id) {
          this.onResumeState(state);
        } else {
          // A stale id from some other booking: ignore it rather than show another booking's payment.
          this.resuming.set(false);
        }
      },
      error: () => {
        this.resuming.set(false);
        if (this.returnedFromRedirect) {
          // The person may well have paid: keep listening (the poller backs off and gives up on its own).
          this.awaitingResult.set(true);
          this.listenTo(paymentId, false);
        }
      },
    });
  }

  private onResumeState(state: TutoringPaymentState): void {
    const outcome = paymentOutcomeOf(state);
    if (outcome !== 'pending') {
      this.resuming.set(false);
      this.applyState(state);
      return;
    }
    if (this.returnedFromRedirect) {
      // Back from 3-D Secure: no client secret to show again, just wait for the verdict.
      this.resuming.set(false);
      this.awaitingResult.set(true);
      this.listenTo(state.paymentId, true);
      return;
    }
    // Still pending, same page after a reload: the server hands the same attempt back with a fresh QR / client secret.
    this.method.set(state.method);
    const subject = this.subject();
    if (subject === undefined) {
      this.resuming.set(false);
      return;
    }
    this.startPayment(subject.id, state.method).subscribe({
      next: (payment) => {
        this.resuming.set(false);
        this.activate(payment);
      },
      error: (error: unknown) => {
        this.resuming.set(false);
        this.onPaymentRefused(error, subject);
      },
    });
  }

  private listenTo(paymentId: string, immediate: boolean): void {
    this.endPolling();
    this.polling.set(true);
    const config: PaymentPollerConfig = {
      fetchState: () => this.payments.getPaymentState(paymentId),
      onState: (state) => this.applyState(state),
      isSettled: isPaymentSettled,
      onGiveUp: () => {
        this.polling.set(false);
        this.pollingGaveUp.set(true);
      },
      isTabVisible: () => this.document.visibilityState === 'visible',
      shouldContinue: () => {
        const hasHold = !!this.subject()?.holdExpiresAtUtc;
        const keep = !hasHold || this.pastHoldMs() < POST_HOLD_GRACE_MS;
        if (!keep) {
          this.polling.set(false);
        }
        return keep;
      },
      immediate,
    };
    this.stopPolling = startPaymentPolling(config);
  }

  private endPolling(): void {
    this.stopPolling?.();
    this.stopPolling = null;
    this.polling.set(false);
  }

  /** Folds one payment read into the page: settled reads end polling; a paid one re-reads the booking. */
  private applyState(state: TutoringPaymentState): void {
    const current = this.payment();
    if (current !== null && state.paymentId !== current.paymentId) {
      return; // A read of an attempt the person has since left: it must not touch the new one.
    }
    this.paymentState.set(state);
    const outcome = paymentOutcomeOf(state);
    this.outcome.set(outcome === 'pending' ? null : outcome);
    if (outcome === 'pending') {
      return;
    }
    this.polling.set(false);
    this.awaitingResult.set(false);
    switch (outcome) {
      case 'paid':
      case 'refunded':
        this.reloadSubject();
        break;
      case 'failed':
        this.payment.set(null);
        this.problem.set(this.i18n.t(this.kind() === 'Package' ? 'tutoring.learner.packages.checkout.attemptFailed' : 'tutoring.checkout.attemptFailed'));
        break;
      case 'expired':
        this.payment.set(null);
        this.problem.set(this.i18n.t(this.kind() === 'Package' ? 'tutoring.learner.packages.checkout.attemptExpired' : 'tutoring.checkout.attemptExpired'));
        break;
    }
  }
}
