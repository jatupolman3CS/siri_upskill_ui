import { CurrencyPipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, afterNextRender, afterRenderEffect, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowsClockwise, phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../core/seo/page-meta';
import { Button } from '../../../../shared/button/button';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { Spinner } from '../../../../shared/spinner/spinner';
import { isRouteDeclared } from '../../data/tutor-booking-link';
import type { TutoringPaymentKind } from '../../data/tutoring-payment.models';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { TutoringCardPanel } from '../../ui/tutoring-card-panel/tutoring-card-panel';
import { CheckoutOutcome, type CheckoutOutcomeKind } from './checkout-outcome/checkout-outcome';
import { CheckoutSummary } from './checkout-summary/checkout-summary';
import { HoldCountdown } from './hold-countdown/hold-countdown';
import { PackageCheckoutOutcome } from './package-checkout-outcome/package-checkout-outcome';
import { PackageCheckoutSummary } from './package-checkout-summary/package-checkout-summary';
import { PaymentMethodChoice } from './payment-method-choice/payment-method-choice';
import { PromptPayPanel } from './promptpay-panel/promptpay-panel';
import { type CheckoutView, TutoringCheckoutFlow } from './tutoring-checkout-flow';

/** Route of the learner's lesson list (P13-23). Its link is shown only once the router declares it. */
const MY_TUTORING_ROUTE = 'my-tutoring';

/** The page-level texts that differ between paying for a lesson and paying for a package. */
interface PageKeys {
  readonly heading: string;
  readonly subheading: string;
  readonly loading: string;
  readonly notFoundHeading: string;
  readonly notFoundBody: string;
  readonly errorHeading: string;
  readonly errorBody: string;
  readonly processingPaid: string;
  readonly verifying: string;
}

const BOOKING_KEYS: PageKeys = {
  heading: 'tutoring.checkout.heading',
  subheading: 'tutoring.checkout.subheading',
  loading: 'tutoring.checkout.loading',
  notFoundHeading: 'tutoring.checkout.notFound.heading',
  notFoundBody: 'tutoring.checkout.notFound.body',
  errorHeading: 'tutoring.checkout.error.heading',
  errorBody: 'tutoring.checkout.error.body',
  processingPaid: 'tutoring.checkout.processing.paid',
  verifying: 'tutoring.checkout.verifying',
};

const PACKAGE_KEYS: PageKeys = {
  heading: 'tutoring.learner.packages.checkout.heading',
  subheading: 'tutoring.learner.packages.checkout.subheading',
  loading: 'tutoring.learner.packages.checkout.loading',
  notFoundHeading: 'tutoring.learner.packages.checkout.notFound.heading',
  notFoundBody: 'tutoring.learner.packages.checkout.notFound.body',
  errorHeading: 'tutoring.learner.packages.checkout.error.heading',
  errorBody: 'tutoring.learner.packages.checkout.error.body',
  processingPaid: 'tutoring.learner.packages.checkout.processingPaid',
  verifying: 'tutoring.learner.packages.checkout.verifying',
};

const HEADING_KEYS: Readonly<Partial<Record<CheckoutView, string>>> = {
  choose: 'tutoring.checkout.headings.choose',
  promptpay: 'tutoring.checkout.headings.promptpay',
  card: 'tutoring.checkout.headings.card',
  processing: 'tutoring.checkout.headings.processing',
  verifying: 'tutoring.checkout.headings.verifying',
};

/**
 * `/tutoring/checkout/:bookingId` and `/tutoring/checkout/package/:purchaseId` (P13-22 / 22b, signed-in, client-rendered, `noindex`) - pay for a held
 * lesson or for a package of lessons, or see how it ended. The second route says so with `data: { checkoutKind: 'Package' }`; everything below is the same.
 * <para>
 * A thin shell over {@link TutoringCheckoutFlow}: the flow owns the state and the server conversation, this template picks the
 * panel for `flow.view()`. The page is the only place that touches the DOM - the 1 s hold tick (browser only), the 3-D Secure
 * return URL, stripping the redirect query from the address bar, and moving focus to the heading whenever the step changes.
 * </para>
 * <para>
 * Free trials arrive here already `Confirmed` and show the confirmation straight away; there is no payment step for them.
 * The price shown is always the booking's (the server's) - there is no client-side amount anywhere on this page.
 * </para>
 */
@Component({
  selector: 'app-tutoring-checkout-page',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    CurrencyThbPipe,
    Button,
    Skeleton,
    Spinner,
    TutorProblem,
    TutoringCardPanel,
    CheckoutOutcome,
    CheckoutSummary,
    PackageCheckoutOutcome,
    PackageCheckoutSummary,
    HoldCountdown,
    PaymentMethodChoice,
    PromptPayPanel,
  ],
  providers: [TutoringCheckoutFlow, CurrencyPipe, provideIcons({ phosphorArrowsClockwise, phosphorWarningCircle })],
  templateUrl: './tutoring-checkout-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutoringCheckoutPage {
  protected readonly flow = inject(TutoringCheckoutFlow);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly translation = inject(TranslationService);

  protected readonly myTutoringAvailable = isRouteDeclared(this.router.config, MY_TUTORING_ROUTE);
  /** What this visit pays for: the package route says `Package`, the booking route says nothing. */
  protected readonly kind: TutoringPaymentKind = this.route.snapshot.data['checkoutKind'] === 'Package' ? 'Package' : 'Booking';
  protected readonly keys: PageKeys = this.kind === 'Package' ? PACKAGE_KEYS : BOOKING_KEYS;
  private readonly subjectId = this.route.snapshot.paramMap.get(this.kind === 'Package' ? 'purchaseId' : 'bookingId') ?? '';
  private readonly returnedFromRedirect = this.route.snapshot.queryParamMap.has('redirect_status');

  /** Where Stripe sends the browser back after 3-D Secure. Built lazily from the document, so it is safe during a server render. */
  protected readonly cardReturnUrl = computed(
    () => `${this.document.location.origin}/tutoring/checkout/${this.kind === 'Package' ? 'package/' : ''}${this.subjectId}`,
  );
  protected readonly headingKey = computed(() => HEADING_KEYS[this.flow.view()]);
  /** Set when the view is one of the closing states (the outcome card replaces the payment panel). */
  protected readonly outcomeKind = computed<CheckoutOutcomeKind | null>(() => {
    const view = this.flow.view();
    return view === 'confirmed' || view === 'ended' || view === 'finalized' || view === 'refunded' ? view : null;
  });

  constructor() {
    setPageMeta({
      title: `${this.translation.t(this.kind === 'Package' ? 'tutoring.learner.packages.checkout.pageTitle' : 'tutoring.checkout.pageTitle')} | ${this.translation.t('common.appName')}`,
      description: this.translation.t(this.kind === 'Package' ? 'tutoring.learner.packages.checkout.pageDescription' : 'tutoring.checkout.pageDescription'),
      robots: 'noindex',
    });
    this.flow.init(this.subjectId, this.returnedFromRedirect, this.kind);

    afterNextRender(() => {
      this.flow.startClock();
      if (this.returnedFromRedirect) {
        // The redirect query (payment intent id and secret, redirect_status) has been read; keep it out of the address bar.
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
    });

    // Move focus to the step's heading whenever the step changes (not on first paint - the layout handled that).
    let firstRun = true;
    afterRenderEffect(() => {
      this.flow.view();
      if (firstRun) {
        firstRun = false;
        return;
      }
      this.document.getElementById('checkout-state-heading')?.focus();
    });
  }
}
