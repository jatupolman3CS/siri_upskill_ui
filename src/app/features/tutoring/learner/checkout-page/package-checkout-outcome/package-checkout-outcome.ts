import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowCounterClockwise, phosphorCheckCircle, phosphorClockCountdown, phosphorProhibit } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import type { PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import { packagePurchaseRoute } from '../../../data/tutoring-package.util';
import { type TutoringPaymentState, lateResolutionOf } from '../../../data/tutoring-payment.models';
import type { CheckoutOutcomeKind } from '../checkout-outcome/checkout-outcome';

interface OutcomeLook {
  readonly icon: string;
  readonly tone: string;
}

const LOOKS: Readonly<Record<CheckoutOutcomeKind, OutcomeLook>> = {
  confirmed: { icon: 'phosphorCheckCircle', tone: 'tone-green' },
  ended: { icon: 'phosphorClockCountdown', tone: 'tone-orange' },
  finalized: { icon: 'phosphorProhibit', tone: 'tone-blue' },
  refunded: { icon: 'phosphorArrowCounterClockwise', tone: 'tone-blue' },
};

/**
 * The closing states of `/tutoring/checkout/package/:purchaseId`: paid and ready to use, the purchase was cancelled or its payment
 * window ended, its credits are already past their expiry, or a late / duplicate payment that is being refunded in full. Each says what
 * happened, what happens to any money, and where to go next. The wording about money follows the server: a payment that arrives
 * after the purchase was given up is either re-opened (then the purchase is `Active`) or refunded.
 */
@Component({
  selector: 'app-package-checkout-outcome',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe],
  templateUrl: './package-checkout-outcome.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorArrowCounterClockwise, phosphorCheckCircle, phosphorClockCountdown, phosphorProhibit })],
  host: { class: 'block' },
})
export class PackageCheckoutOutcome {
  readonly kind = input.required<CheckoutOutcomeKind>();
  readonly purchase = input.required<PackagePurchaseSummary>();
  /** Last read of the payment (the refund wording needs its amount, method and late resolution). */
  readonly paymentState = input<TutoringPaymentState | null>(null);

  protected readonly look = computed(() => LOOKS[this.kind()]);
  protected readonly purchaseLink = computed(() => packagePurchaseRoute(this.purchase().purchaseId));
  protected readonly refundIsDuplicate = computed(() => {
    const state = this.paymentState();
    return state !== null && lateResolutionOf(state) === 'Duplicate';
  });
  protected readonly refundIsPromptPay = computed(() => this.paymentState()?.method === 'PromptPay');
}
