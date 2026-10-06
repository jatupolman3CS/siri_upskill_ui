import { CurrencyPipe, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorCheck,
  phosphorCheckCircle,
  phosphorClock,
  phosphorCreditCard,
  phosphorImage,
  phosphorLockSimple,
  phosphorQrCode,
  phosphorReceipt,
  phosphorShieldCheck,
  phosphorTicket,
  phosphorTimer,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Button } from '../../../shared/button/button';
import { Checkbox } from '../../../shared/checkbox/checkbox';
import { InputField } from '../../../shared/input/input';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Spinner } from '../../../shared/spinner/spinner';
import {
  OrderDetailResponse,
  PaymentConfigResponse,
  PaymentMethod,
  PaymentResponse,
} from '../data/commerce-api.models';
import { CommerceApiService } from '../data/commerce-api.service';
import { CardPaymentPanel } from './card-payment-panel/card-payment-panel';
import { decideCardPaymentResumeAction, takePendingCardPaymentId } from './card-payment-resume';

/** ~2 minutes of 3 s polls before the post-redirect resume state gives up. */
const RESUME_POLL_MAX_ATTEMPTS = 40;

export type CheckoutStep = 'selection' | 'qr_display' | 'card_entry' | 'card_processing' | 'success' | 'expired';

/**
 * `/checkout` or `/checkout/:orderId` (task P3-21) — The checkout and PromptPay QR payment page.
 * Implements the 2-column Layout A from SIRI UpSkill Mockups (2026-08-20).
 */
@Component({
  selector: 'app-checkout-page',
  imports: [
    RouterLink,
    FormsModule,
    TranslatePipe,
    CurrencyThbPipe,
    NgIcon,
    Button,
    Checkbox,
    InputField,
    Skeleton,
    Spinner,
    CardPaymentPanel,
  ],
  templateUrl: './checkout-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    provideIcons({
      phosphorQrCode,
      phosphorCreditCard,
      phosphorReceipt,
      phosphorShieldCheck,
      phosphorTicket,
      phosphorCheckCircle,
      phosphorClock,
      phosphorLockSimple,
      phosphorArrowLeft,
      phosphorWarningCircle,
      phosphorCheck,
      phosphorImage,
      phosphorTimer,
    }),
  ],
})
export class CheckoutPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly commerceApi = inject(CommerceApiService);
  private readonly seoService = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  protected readonly translation = inject(TranslationService);
  protected readonly auth = inject(AuthService);

  // Signals for state
  protected readonly orderId = signal<string>('');
  protected readonly order = signal<OrderDetailResponse | null>(null);
  protected readonly isLoadingOrder = signal<boolean>(true);
  protected readonly orderError = signal<string | null>(null);

  public readonly selectedMethod = signal<PaymentMethod>('PromptPay');
  public readonly payment = signal<PaymentResponse | null>(null);
  public readonly isCreatingPayment = signal<boolean>(false);
  public readonly paymentError = signal<string | null>(null);

  // `GET /commerce/payments/config` (P11-09) — Card tab only renders once this confirms `Card` is
  // in `enabledMethods`; loaded independently of the order, no need to wait on it (contract §4.1).
  public readonly paymentConfig = signal<PaymentConfigResponse | null>(null);
  protected readonly isCardMethodEnabled = computed(() => this.paymentConfig()?.enabledMethods.includes('Card') ?? false);

  /** `return_url` handed to Stripe's `confirmPayment` (contract §4.2) — built from `DOCUMENT`
   * (Angular's SSR-safe document abstraction, same pattern `SeoService` already uses) rather than
   * `window.location` directly, so this stays safe to evaluate even during a server render. */
  protected readonly cardReturnUrl = computed(() => `${this.document.location.origin}/checkout/${this.orderId()}`);

  // Resuming after a Stripe 3DS full-page redirect (contract §4.3) — sessionStorage had a pending
  // payment id but this page reloaded with no way to resolve it from route/query state alone yet.
  protected readonly isResumingAfterRedirect = signal<boolean>(false);

  // QR display & countdown
  public readonly qrTimeRemainingSeconds = signal<number>(900); // 15 minutes default
  public readonly paymentPollStatus = signal<'idle' | 'polling' | 'succeeded' | 'expired' | 'error'>('idle');

  public readonly currentStep = computed<CheckoutStep>(() => {
    if (this.paymentPollStatus() === 'succeeded') return 'success';
    if (this.paymentPollStatus() === 'expired') return 'expired';
    if (this.isResumingAfterRedirect()) return 'card_processing';
    const p = this.payment();
    if (p?.method === 'Card') {
      return this.paymentPollStatus() === 'polling' ? 'card_processing' : 'card_entry';
    }
    // Resuming after a 3DS redirect with a pending payment id known from sessionStorage: polling
    // starts directly against that id (contract §4.3) without ever re-fetching a payment() object
    // in THIS page instance — only reachable for Card (PromptPay never redirects off-page).
    if (!p && this.paymentPollStatus() === 'polling') return 'card_processing';
    if (p) return 'qr_display';
    return 'selection';
  });

  // e-Tax toggle & inputs
  public readonly etaxChecked = signal<boolean>(false);
  public readonly taxId = signal<string>('');
  public readonly taxName = signal<string>('');

  // Promo code
  public readonly promoCodeInput = signal<string>('');
  public readonly appliedPromo = signal<{ code: string; discountAmount: number; totalAmount: number } | null>(null);
  public readonly promoError = signal<string | null>(null);
  public readonly isApplyingPromo = signal<boolean>(false);

  private countdownIntervalId: ReturnType<typeof setInterval> | null = null;
  private pollingIntervalId: ReturnType<typeof setInterval> | null = null;

  // Computed values
  public readonly subtotal = computed(() => {
    const o = this.order();
    return o ? o.subtotalAmount : 0;
  });

  public readonly discount = computed(() => {
    const promo = this.appliedPromo();
    if (promo) return promo.discountAmount;
    const o = this.order();
    return o ? o.discountAmount : 0;
  });

  public readonly total = computed(() => {
    return this.appliedPromo()?.totalAmount ?? this.order()?.totalAmount ?? 0;
  });

  protected readonly formattedTimeRemaining = computed(() => {
    const totalSec = this.qrTimeRemainingSeconds();
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  constructor() {
    // Read route param or query param
    const id = this.route.snapshot.paramMap.get('orderId') || this.route.snapshot.queryParamMap.get('orderId') || '';
    this.orderId.set(id);

    effect(() => {
      this.seoService.set({
        title: `${this.translation.t('checkout.pageTitle')}`,
        description: this.translation.t('checkout.pageDescription'),
        path: '/checkout',
        robots: 'noindex', // Protected financial page
      });
    });

    if (id) {
      this.loadOrder(id);
    } else {
      this.isLoadingOrder.set(false);
      this.orderError.set('ไม่พบคำสั่งซื้อ กรุณาสร้างคำสั่งซื้อจากตะกร้าสินค้า');
      this.router.navigate(['/cart']);
    }

    // Fires alongside the order fetch, not after it — the two are independent (contract §4.1).
    this.commerceApi.getPaymentConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (config) => this.paymentConfig.set(config),
      error: () => {
        // Leave paymentConfig() null — the Card tab template guard (`isCardMethodEnabled()`)
        // already treats "not loaded yet" and "Card not enabled" identically (fixed "coming soon"
        // card), so a failed config fetch degrades safely without its own error banner.
      },
    });

    // Resume-after-3DS-redirect (contract §4.3) — must run browser-only (reads the URL's query
    // param and sessionStorage), hence afterNextRender, not the constructor body directly, per
    // frontend.md's SSR rule (same reasoning as ConfirmEmailPage's afterNextRender use). The
    // sessionStorage read + poll-vs-generic-resume decision itself lives in card-payment-resume.ts
    // (extracted so it's independently unit-testable, same split style as playback-url-renewal.ts).
    afterNextRender(() => {
      if (!this.route.snapshot.queryParamMap.has('redirect_status')) {
        return;
      }

      const action = decideCardPaymentResumeAction(takePendingCardPaymentId());
      if (action.kind === 'pollPayment') {
        this.paymentPollStatus.set('polling');
        this.startPaymentPolling(action.paymentId);
      } else {
        // New tab / cleared storage: no way to know which payment to poll. Show a generic resuming
        // state and poll the order itself until the webhook has marked it Paid (or give up and fall
        // back to the normal selection UI) — loadOrder()'s `status === 'Paid'` check only runs once.
        this.isResumingAfterRedirect.set(true);
        this.startResumeOrderPolling();
      }

      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    });

    this.destroyRef.onDestroy(() => {
      this.stopCountdown();
      this.stopPolling();
    });
  }

  protected loadOrder(orderId: string): void {
    this.isLoadingOrder.set(true);
    this.orderError.set(null);

    this.commerceApi.getOrder(orderId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        this.order.set(order);
        this.isLoadingOrder.set(false);
        if (order.status === 'Paid') {
          this.completeCheckout(order.id);
        }
      },
      error: (err: ApiError) => {
        this.isLoadingOrder.set(false);
        this.orderError.set(
          err.message
            ? this.translation.t(err.message)
            : this.translation.t('checkout.error.orderNotFound')
        );
      },
    });
  }

  public initiatePayment(): void {
    const o = this.order();
    if (!o || this.isCreatingPayment()) return;

    this.isCreatingPayment.set(true);
    this.paymentError.set(null);

    const promo = this.appliedPromo();
    const courseIds = (o.items.map((i) => i.courseId).filter((id): id is string => !!id)) ?? [];

    // The server must reprice a replacement order whenever a new code is selected.
    if (promo) {
      this.commerceApi.createOrder({ courseIds, promoCode: promo.code }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (newOrder) => {
          this.order.set(newOrder);
          this.orderId.set(newOrder.id);
          this.appliedPromo.set(null);
          if (newOrder.status === 'Paid') {
            this.completeCheckout(newOrder.id);
            return;
          }
          this.router.navigate(['/checkout', newOrder.id], { replaceUrl: true });
          this.executePayment(newOrder.id);
        },
        error: (err: ApiError) => {
          this.isCreatingPayment.set(false);
          this.paymentError.set(
            err.message
              ? this.translation.t(err.message)
              : this.translation.t('checkout.error.createPaymentFailed')
          );
        },
      });
    } else if (o.status === 'Paid') {
      this.completeCheckout(o.id);
    } else {
      this.executePayment(o.id);
    }
  }

  private executePayment(orderId: string): void {
    this.commerceApi
      .createPayment({
        orderId,
        method: this.selectedMethod(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payment) => {
          if (payment.status === 'Succeeded') {
            this.completeCheckout(payment.orderId);
            return;
          }
          if (payment.method === 'Card') {
            // Card never carries qrCodeUrl (it's PromptPay-only, contract §3) — that must not be
            // read as a failure here. clientSecret missing IS a real failure, though: without it
            // CardPaymentPanel has nothing to mount the Payment Element against.
            if (!payment.clientSecret) {
              this.isCreatingPayment.set(false);
              this.paymentError.set(this.translation.t('checkout.error.createPaymentFailed'));
              return;
            }
            this.payment.set(payment);
            this.isCreatingPayment.set(false);
            // No countdown here — that's PromptPay QR's 15-minute expiry window, not applicable
            // to a Stripe PaymentIntent awaiting card entry. Polling starts once the panel emits
            // confirmedInline() (onCardConfirmedInline below), not immediately like PromptPay.
            return;
          }
          if (!payment.qrCodeUrl) {
            this.isCreatingPayment.set(false);
            this.paymentError.set(this.translation.t('checkout.error.createPaymentFailed'));
            return;
          }
          this.payment.set(payment);
          this.isCreatingPayment.set(false);
          this.paymentPollStatus.set('polling');
          this.startCountdown();
          this.startPaymentPolling(payment.id);
        },
        error: (err: ApiError) => {
          this.isCreatingPayment.set(false);
          this.paymentError.set(
            err.message
              ? this.translation.t(err.message)
              : this.translation.t('checkout.error.createPaymentFailed')
          );
        },
      });
  }

  public applyPromoCode(): void {
    if (this.isApplyingPromo() || this.isCreatingPayment() || this.payment()) return;
    const code = this.promoCodeInput().trim();
    if (!code) {
      this.promoError.set(this.translation.t('checkout.summary.promoEmpty'));
      return;
    }

    const o = this.order();
    const courseIds = (o?.items.map((i) => i.courseId).filter((id): id is string => !!id)) ?? [];

    this.isApplyingPromo.set(true);
    this.promoError.set(null);

    this.commerceApi.validatePromoCode({ code, courseIds }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.isApplyingPromo.set(false);
        if (res.isValid) {
          this.appliedPromo.set({ code: res.code, discountAmount: res.discountAmount, totalAmount: res.totalAmount });
        } else {
          this.promoError.set(res.errorMessage || this.translation.t('checkout.summary.promoError'));
        }
      },
      error: (err: ApiError) => {
        this.isApplyingPromo.set(false);
        this.promoError.set(
          err?.message
            ? this.translation.t(err.message)
            : this.translation.t('checkout.summary.promoError')
        );
      },
    });
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.qrTimeRemainingSeconds.set(900); // 15 minutes
    this.countdownIntervalId = setInterval(() => {
      const current = this.qrTimeRemainingSeconds();
      if (current <= 1) {
        this.qrTimeRemainingSeconds.set(0);
        this.paymentPollStatus.set('expired');
        this.stopCountdown();
        this.stopPolling();
      } else {
        this.qrTimeRemainingSeconds.set(current - 1);
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
  }

  private startPaymentPolling(paymentId: string): void {
    this.stopPolling();
    this.pollingIntervalId = setInterval(() => {
      this.commerceApi.getPayment(paymentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (res) => {
          if (res.status === 'Succeeded') {
            this.completeCheckout(res.orderId);
          } else if (res.status === 'Expired' || res.status === 'Failed') {
            this.paymentPollStatus.set('expired');
            this.stopPolling();
            this.stopCountdown();
          }
        },
        error: () => {
          // Keep polling on transient network failure
        },
      });
    }, 3000);
  }

  /** Resume fallback for `isResumingAfterRedirect` when no payment id survived the 3DS redirect.
   * Stops (and restores the normal selection UI) on a terminal order status or after `RESUME_POLL_MAX_ATTEMPTS`. */
  private startResumeOrderPolling(): void {
    const orderId = this.orderId();
    if (!orderId) {
      this.isResumingAfterRedirect.set(false);
      return;
    }

    let attempts = 0;
    const endResume = (): void => {
      this.stopPolling();
      this.isResumingAfterRedirect.set(false);
    };

    this.stopPolling();
    this.pollingIntervalId = setInterval(() => {
      attempts++;
      this.commerceApi.getOrder(orderId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (order) => {
          if (order.status === 'Paid') {
            this.completeCheckout(order.id);
            return;
          }
          if (order.status === 'Failed' || order.status === 'Cancelled' || attempts >= RESUME_POLL_MAX_ATTEMPTS) {
            this.order.set(order);
            endResume();
          }
        },
        error: () => {
          if (attempts >= RESUME_POLL_MAX_ATTEMPTS) {
            endResume();
          }
        },
      });
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }

  private completeCheckout(orderId: string): void {
    this.isCreatingPayment.set(false);
    this.paymentPollStatus.set('succeeded');
    this.stopPolling();
    this.stopCountdown();
    this.router.navigate(['/checkout/success', orderId], { replaceUrl: true });
  }

  public setMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
  }

  /** `CardPaymentPanel`'s `confirmedInline` output — `confirmPayment()` resolved with no error and
   * no full-page redirect happened. This is NOT proof of payment success (security.md) — it only
   * means it is now safe to fall back to the same `startPaymentPolling()` PromptPay already uses
   * against `GET /commerce/payments/{id}`, the only source of truth for the actual outcome. */
  protected onCardConfirmedInline(): void {
    const p = this.payment();
    if (!p) {
      return;
    }
    this.paymentPollStatus.set('polling');
    this.startPaymentPolling(p.id);
  }

  /** `CardPaymentPanel`'s `paymentError` output — an inline confirm-time failure (Stripe.js failed
   * to load, or `confirmPayment()` itself returned an error). `translation.t()` safely passes
   * through an already-user-safe raw Stripe message unchanged (it only translates real dictionary
   * keys) — see that panel's own doc comment. */
  protected onCardPaymentError(message: string): void {
    this.paymentError.set(this.translation.t(message));
  }

  public toggleEtax(checked: boolean): void {
    this.etaxChecked.set(checked);
  }

  public updatePromoCode(val: string): void {
    this.promoCodeInput.set(val);
  }

  public updateTaxId(val: string): void {
    this.taxId.set(val);
  }

  public updateTaxName(val: string): void {
    this.taxName.set(val);
  }
}
