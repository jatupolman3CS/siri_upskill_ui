import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import {
  OrderDetailResponse,
  PaymentMethod,
  PaymentResponse,
} from '../data/commerce-api.models';
import { CommerceApiService } from '../data/commerce-api.service';

export type CheckoutStep = 'selection' | 'qr_display' | 'success' | 'expired';

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

  // QR display & countdown
  public readonly qrTimeRemainingSeconds = signal<number>(900); // 15 minutes default
  public readonly paymentPollStatus = signal<'idle' | 'polling' | 'succeeded' | 'expired' | 'error'>('idle');

  // e-Tax toggle & inputs
  public readonly etaxChecked = signal<boolean>(false);
  public readonly taxId = signal<string>('');
  public readonly taxName = signal<string>('');

  // Promo code
  public readonly promoCodeInput = signal<string>('');
  public readonly appliedPromo = signal<{ code: string; discountAmount: number } | null>(null);
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
    const sub = this.subtotal();
    const disc = this.discount();
    return Math.max(0, sub - disc);
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
      // Create mock or fallback order for demonstration / direct navigation
      this.order.set({
        id: 'sample-order-id',
        orderNo: 'SU-88214',
        subtotalAmount: 3880,
        discountAmount: 0,
        taxAmount: 253.83,
        totalAmount: 3880,
        currency: 'THB',
        status: 'Pending',
        items: [
          {
            id: 'item-1',
            titleSnapshot: 'Digital Marketing ครบวงจร',
            instructorName: 'คุณนภา วงศ์สว่าง',
            unitPrice: 1890,
            lineTotal: 1890,
          },
          {
            id: 'item-2',
            titleSnapshot: 'สร้าง Mobile App ด้วย Flutter',
            instructorName: 'อ.สมชาย ใจดี',
            unitPrice: 1990,
            lineTotal: 1990,
          },
        ],
      });
      this.isLoadingOrder.set(false);
    }

    this.destroyRef.onDestroy(() => {
      this.stopCountdown();
      this.stopPolling();
    });
  }

  protected loadOrder(orderId: string): void {
    this.isLoadingOrder.set(true);
    this.orderError.set(null);

    this.commerceApi.getOrder(orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.isLoadingOrder.set(false);
        if (order.status === 'Paid') {
          this.paymentPollStatus.set('succeeded');
        }
      },
      error: (err: ApiError) => {
        this.isLoadingOrder.set(false);
        this.orderError.set(err.message || this.translation.t('checkout.error.orderNotFound'));
      },
    });
  }

  public initiatePayment(): void {
    const o = this.order();
    if (!o) return;

    this.isCreatingPayment.set(true);
    this.paymentError.set(null);

    const promo = this.appliedPromo();
    const courseIds = (o.items.map((i) => i.courseId).filter((id): id is string => !!id)) ?? [];

    // If promo is applied and the order in state doesn't have the promo discount, create a new order with the promo
    if (promo && (!o.discountAmount || o.discountAmount === 0)) {
      this.commerceApi.createOrder({ courseIds, promoCode: promo.code }).subscribe({
        next: (newOrder) => {
          this.order.set(newOrder);
          if (newOrder.status === 'Paid' || newOrder.totalAmount <= 0) {
            this.isCreatingPayment.set(false);
            this.paymentPollStatus.set('succeeded');
            setTimeout(() => {
              this.router.navigate(['/courses']);
            }, 1500);
            return;
          }
          this.executePayment(newOrder.id);
        },
        error: (err: ApiError) => {
          this.isCreatingPayment.set(false);
          this.paymentError.set(err.message || this.translation.t('checkout.error.createPaymentFailed'));
        },
      });
    } else if (o.status === 'Paid' || o.totalAmount <= 0) {
      this.isCreatingPayment.set(false);
      this.paymentPollStatus.set('succeeded');
      setTimeout(() => {
        this.router.navigate(['/courses']);
      }, 1500);
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
      .subscribe({
        next: (payment) => {
          this.payment.set(payment);
          this.isCreatingPayment.set(false);
          this.paymentPollStatus.set('polling');
          this.startCountdown();
          this.startPaymentPolling(payment.id);
        },
        error: (err: ApiError) => {
          this.isCreatingPayment.set(false);
          this.paymentError.set(
            err.message || this.translation.t('checkout.error.createPaymentFailed')
          );
        },
      });
  }

  public applyPromoCode(): void {
    const code = this.promoCodeInput().trim();
    if (!code) {
      this.promoError.set(this.translation.t('checkout.summary.promoEmpty'));
      return;
    }

    const o = this.order();
    const courseIds = (o?.items.map((i) => i.courseId).filter((id): id is string => !!id)) ?? [];

    this.isApplyingPromo.set(true);
    this.promoError.set(null);

    this.commerceApi.validatePromoCode({ code, courseIds }).subscribe({
      next: (res) => {
        this.isApplyingPromo.set(false);
        if (res.isValid) {
          this.appliedPromo.set({ code: res.code, discountAmount: res.discountAmount });
        } else {
          this.promoError.set(res.errorMessage || this.translation.t('checkout.summary.promoError'));
        }
      },
      error: (err) => {
        this.isApplyingPromo.set(false);
        this.promoError.set(err?.error?.detail || err?.message || this.translation.t('checkout.summary.promoError'));
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
      this.commerceApi.getPayment(paymentId).subscribe({
        next: (res) => {
          if (res.status === 'Succeeded') {
            this.paymentPollStatus.set('succeeded');
            this.stopPolling();
            this.stopCountdown();
            // Redirect to classroom / success after 2 seconds
            setTimeout(() => {
              this.router.navigate(['/courses']);
            }, 2000);
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

  private stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }

  public setMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
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
