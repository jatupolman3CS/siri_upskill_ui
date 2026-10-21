import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import type { PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import { packageStatusView } from '../../../data/tutoring-package.util';

/**
 * The order summary beside the package checkout: whose lessons, how many and how long, and the server's price (`priceSnapshot`, fixed
 * when the purchase was made). Everything is read from the purchase the server returned - the page never adds, multiplies or rounds an
 * amount, and never works out an expiry date: once the purchase is paid the server's `expiresAtUtc` appears here. The wording about
 * expiry and refunds is always shown, before the person pays.
 */
@Component({
  selector: 'app-package-checkout-summary',
  imports: [TranslatePipe, BangkokDatePipe, CurrencyThbPipe],
  templateUrl: './package-checkout-summary.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'block' },
})
export class PackageCheckoutSummary {
  readonly purchase = input.required<PackagePurchaseSummary>();

  protected readonly statusKey = computed(() => packageStatusView(this.purchase()).labelKey);
}
