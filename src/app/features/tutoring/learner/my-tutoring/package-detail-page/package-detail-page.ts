import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowLeft } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../../core/seo/page-meta';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import type { Guid } from '../../../data/tutoring-learner.models';
import { TutoringPackagePurchaseApiService } from '../../../data/tutoring-package-purchase-api.service';
import { canOfferCreditBooking, packageCheckoutRoute, packageStatusView } from '../../../data/tutoring-package.util';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { PackageCreditBooking } from '../package-credit-booking/package-credit-booking';
import { PackageCreditList } from '../package-credit-list/package-credit-list';

/**
 * `/my-tutoring/packages/:purchaseId` (P13-22b, signed-in, client-rendered, `noindex`) - one package in full: what it is, how many
 * lessons are left and until when, every credit and the lesson that holds it, and - while the server says there are credits to use - the
 * calendar to spend one. Another learner's purchase and a missing one answer the same `404`, which reads as "not found".
 * <para>
 * Every figure is the server's. The purchase carries no offering, so the calendar's subject is looked up in the tutor's public package
 * list by package id; if the tutor has since taken the package off sale it is not there and the page says it cannot show times for it
 * right now (the credits stay valid - this is a display gap, not the person's loss). The no-refund-after-expiry wording is always shown.
 * </para>
 */
@Component({
  selector: 'app-package-detail-page',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, EmptyState, Skeleton, StatusChip, TutorProblem, PackageCreditBooking, PackageCreditList],
  templateUrl: './package-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorArrowLeft })],
})
export class PackageDetailPage {
  private readonly api = inject(TutoringPackagePurchaseApiService);
  private readonly publicApi = inject(TutoringPublicApiService);
  private readonly i18n = inject(TranslationService);
  protected readonly purchaseId: Guid = inject(ActivatedRoute).snapshot.paramMap.get('purchaseId') ?? '';

  private readonly purchaseResource = rxResource({ params: () => this.purchaseId, stream: ({ params }) => this.api.getPurchase(params) });
  protected readonly purchase = computed(() => (this.purchaseResource.hasValue() ? this.purchaseResource.value() : null));
  protected readonly isLoading = computed(() => this.purchaseResource.isLoading() && !this.purchaseResource.hasValue());
  protected readonly notFound = computed(() => {
    const error: unknown = this.purchaseResource.error();
    return this.purchaseResource.status() === 'error' && error instanceof ApiError && error.status === 404;
  });
  protected readonly hasError = computed(() => this.purchaseResource.status() === 'error' && !this.notFound());

  protected readonly statusView = computed(() => {
    const purchase = this.purchase();
    return purchase === null ? null : packageStatusView(purchase);
  });
  protected readonly canBook = computed(() => {
    const purchase = this.purchase();
    return purchase !== null && canOfferCreditBooking(purchase);
  });
  protected readonly canPay = computed(() => this.purchase()?.status === 'PendingPayment' && this.purchase()?.requiresPayment === true);
  protected readonly checkoutLink = computed(() => packageCheckoutRoute(this.purchaseId));

  /** The tutor's package list, read only when a lesson can be booked: it names the offering the calendar needs. */
  private readonly offersSlug = computed(() => {
    const purchase = this.purchase();
    return purchase !== null && this.canBook() ? purchase.tutor.slug : undefined;
  });
  private readonly offersResource = rxResource({
    // Reads only the slug, so reading the purchase again (after a booking) does not read the tutor's packages again.
    params: () => this.offersSlug(),
    stream: ({ params }) => this.publicApi.listTutorPackages(params),
  });
  protected readonly offeringId = computed(() => {
    const purchase = this.purchase();
    const offers = this.offersResource.hasValue() ? this.offersResource.value() : [];
    return offers.find((offer) => offer.packageId === purchase?.packageId)?.offering.offeringId ?? null;
  });
  protected readonly offeringLoading = computed(() => this.canBook() && !this.offersResource.hasValue() && this.offersResource.status() !== 'error');
  protected readonly offeringMissing = computed(() => this.canBook() && !this.offeringLoading() && this.offeringId() === null);

  protected readonly confirmingCancel = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly problem = signal<string | null>(null);

  constructor() {
    setPageMeta({
      title: `${this.i18n.t('tutoring.learner.packages.my.detail.pageTitle')} | ${this.i18n.t('common.appName')}`,
      description: this.i18n.t('tutoring.learner.packages.my.detail.pageDescription'),
      robots: 'noindex',
    });
  }

  protected reload(): void {
    this.purchaseResource.reload();
  }

  protected retryOffers(): void {
    this.offersResource.reload();
  }

  protected askCancel(): void {
    this.problem.set(null);
    this.confirmingCancel.set(true);
  }

  protected keepPurchase(): void {
    this.confirmingCancel.set(false);
  }

  /** Gives up a purchase that is still unpaid. The button is busy while the call is out; once paid the server refuses (409). */
  protected cancelPurchase(): void {
    if (this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.problem.set(null);
    this.api.cancelPending(this.purchaseId).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.confirmingCancel.set(false);
        this.reload();
      },
      error: (error: unknown) => {
        this.cancelling.set(false);
        this.confirmingCancel.set(false);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
        this.reload();
      },
    });
  }
}
