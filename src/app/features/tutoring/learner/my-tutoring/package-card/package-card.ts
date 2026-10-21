import { CurrencyPipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { MediaUrlPipe } from '../../../../../core/pipes/media-url.pipe';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import type { PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import { canOfferCreditBooking, packageCheckoutRoute, packagePurchaseRoute, packageStatusView } from '../../../data/tutoring-package.util';

/**
 * One package purchase in the "My packages" list. Everything on it is what the server sent: the status, the credits left, the price
 * and the dates. The card never works out a count, a date or an amount - it picks wording and the next step: pay (while unpaid), book a
 * lesson with a credit (while the server says there are credits to use), or look at the details. The unused-credits-are-not-refunded
 * wording is on every paid card, next to the date it applies from.
 */
@Component({
  selector: 'app-package-card',
  imports: [RouterLink, NgOptimizedImage, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, MediaUrlPipe, StatusChip],
  templateUrl: './package-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'block' },
})
export class PackageCard {
  readonly purchase = input.required<PackagePurchaseSummary>();

  protected readonly statusView = computed(() => packageStatusView(this.purchase()));
  protected readonly titleId = computed(() => `my-package-${this.purchase().purchaseId}`);
  protected readonly initial = computed(() => this.purchase().tutor.displayName.trim().charAt(0).toUpperCase());
  protected readonly detailsLink = computed(() => packagePurchaseRoute(this.purchase().purchaseId));
  protected readonly checkoutLink = computed(() => packageCheckoutRoute(this.purchase().purchaseId));
  protected readonly canPay = computed(() => this.purchase().status === 'PendingPayment' && this.purchase().requiresPayment);
  protected readonly canBook = computed(() => canOfferCreditBooking(this.purchase()));
  /** The one date worth showing on the card: when to pay by, how long the credits are valid, or when they ran out. All server values. */
  protected readonly dateLine = computed<{ readonly key: string; readonly date: string } | null>(() => {
    const purchase = this.purchase();
    if (purchase.status === 'PendingPayment') {
      return purchase.pendingExpiresAtUtc === null ? null : { key: 'tutoring.learner.packages.my.card.payBy', date: purchase.pendingExpiresAtUtc };
    }
    if (purchase.expiresAtUtc === null) {
      return null;
    }
    const usable = purchase.status === 'Active' || purchase.status === 'Exhausted';
    return { key: usable ? 'tutoring.learner.packages.my.card.validUntil' : 'tutoring.learner.packages.my.card.expiredOn', date: purchase.expiresAtUtc };
  });
  /** Width of the "used" part of the credit bar - decoration only; the figures next to it are the server's. */
  protected readonly usedPercent = computed(() => {
    const { sessionsUsed, sessionsTotal } = this.purchase();
    return sessionsTotal > 0 ? Math.min(100, Math.round((sessionsUsed / sessionsTotal) * 100)) : 0;
  });
}
