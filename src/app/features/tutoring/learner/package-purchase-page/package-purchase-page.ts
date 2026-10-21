import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiError } from '../../../../core/http/error.interceptor';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { SeoService } from '../../../../core/seo/seo.service';
import { Breadcrumb, type BreadcrumbItem } from '../../../../shared/breadcrumb/breadcrumb';
import { Button } from '../../../../shared/button/button';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { tutoringErrorKey, tutoringReasonOf } from '../../data/tutoring-errors';
import { curriculumLabelKey, levelLabelKey, localizedName } from '../../data/tutoring-labels';
import type { LearnerProfile } from '../../data/tutoring-learner.models';
import { TutoringPackagePurchaseApiService } from '../../data/tutoring-package-purchase-api.service';
import { packageCheckoutRoute } from '../../data/tutoring-package.util';
import type { PackageOffer } from '../../data/tutoring-packages.models';
import { TutoringPublicApiService } from '../../data/tutoring-public-api.service';
import type { TutorPublicProfile } from '../../data/tutoring-public.models';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { LearnerProfilePicker } from '../learner-profile-picker/learner-profile-picker';

/**
 * `/tutors/:slug/packages/:packageId` (P13-22b, signed-in, client-rendered, `noindex`) - buy a package of lessons: see exactly what is
 * sold, say who the lessons are for, and continue to the payment.
 * <para>
 * Every figure on it is the server's: the package comes from the tutor's public package list (price per lesson, the discount, the
 * total and the saving are computed by the server's price calculator and shown as given), and starting the purchase sends only the
 * package id and the learner profile - the server fixes the price from the tutor's current rate. The wording that unused lessons are
 * not refunded after the expiry date is shown before the person commits. A package that is no longer on sale reads as "not available",
 * the same for every cause. Success always continues at `/tutoring/checkout/package/:purchaseId`.
 * </para>
 */
@Component({
  selector: 'app-package-purchase-page',
  imports: [RouterLink, TranslatePipe, CurrencyThbPipe, Breadcrumb, Button, Skeleton, TutorProblem, LearnerProfilePicker],
  templateUrl: './package-purchase-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class PackagePurchasePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publicApi = inject(TutoringPublicApiService);
  private readonly purchaseApi = inject(TutoringPackagePurchaseApiService);
  private readonly seo = inject(SeoService);
  protected readonly translation = inject(TranslationService);

  private readonly paramMap = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly slug = computed(() => this.paramMap().get('slug') ?? '');
  private readonly packageId = computed(() => this.paramMap().get('packageId') ?? '');

  private readonly tutorResource = rxResource({ params: () => this.slug(), stream: ({ params }) => this.publicApi.getTutorProfile(params) });
  protected readonly tutor = computed<TutorPublicProfile | undefined>(() => (this.tutorResource.hasValue() ? this.tutorResource.value() : undefined));
  private readonly tutorError = computed(() => this.tutorResource.error() as ApiError | undefined);
  protected readonly tutorNotFound = computed(() => this.tutorError()?.status === 404);
  protected readonly tutorFailed = computed(() => this.tutorError() !== undefined && this.tutorError()?.status !== 404);

  private readonly offersResource = rxResource({ params: () => this.slug(), stream: ({ params }) => this.publicApi.listTutorPackages(params) });
  /** The package being bought, from the tutor's list of packages on sale; `undefined` when it is not (or no longer) on sale. */
  protected readonly offer = computed<PackageOffer | undefined>(() =>
    this.offersResource.hasValue() ? this.offersResource.value().find((candidate) => candidate.packageId === this.packageId()) : undefined,
  );
  protected readonly offersLoaded = computed(() => this.offersResource.hasValue());
  protected readonly offersFailed = computed(() => this.offersResource.status() === 'error');

  protected readonly learner = signal<LearnerProfile | null>(null);
  protected readonly submitting = signal(false);
  protected readonly problem = signal<string | null>(null);
  /** Set with `too_many_pending_purchases`: the person has unpaid purchases to finish (or give up) first. */
  protected readonly tooManyPending = signal(false);
  private readonly picker = viewChild(LearnerProfilePicker);

  protected readonly canContinue = computed(() => this.offer() !== undefined && this.learner() !== null);
  protected readonly levelKey = levelLabelKey;
  protected readonly curriculumKey = curriculumLabelKey;
  protected readonly localizedName = localizedName;
  protected readonly breadcrumbItems = computed<readonly BreadcrumbItem[]>(() => {
    const tutor = this.tutor();
    return tutor === undefined
      ? []
      : [
          { label: this.translation.t('nav.home'), href: '/' },
          { label: this.translation.t('tutoring.public.search.heading'), href: '/tutors' },
          { label: tutor.displayName, href: `/tutors/${tutor.slug}` },
          { label: this.translation.t('tutoring.learner.packages.purchase.breadcrumb') },
        ];
  });

  constructor() {
    effect(() => {
      const tutor = this.tutor();
      this.seo.set({
        title: `${this.translation.t('tutoring.learner.packages.purchase.pageTitle', { name: tutor?.displayName ?? '' }).trim()} | ${this.translation.t('common.appName')}`,
        description: this.translation.t('tutoring.learner.packages.purchase.pageDescription'),
        path: `/tutors/${this.slug()}/packages/${this.packageId()}`,
        robots: 'noindex',
      });
    });
  }

  protected retry(): void {
    this.tutorResource.reload();
    this.offersResource.reload();
  }

  /** Starts the purchase (price fixed by the server) and continues at its payment. The button is busy while the call is out. */
  protected buy(): void {
    const offer = this.offer();
    const learner = this.learner();
    if (this.submitting() || offer === undefined || learner === null) {
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    this.tooManyPending.set(false);
    this.purchaseApi.purchase(offer.packageId, learner.learnerProfileId).subscribe({
      next: (purchase) => {
        this.submitting.set(false);
        void this.router.navigate(packageCheckoutRoute(purchase.purchaseId));
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.onRefused(error);
      },
    });
  }

  /** Turns a documented refusal into the recovery it needs, then explains it. */
  private onRefused(error: unknown): void {
    const reason = tutoringReasonOf(error);
    if (reason === 'tutoring.package_not_found' || reason === 'tutoring.package_offering_inactive') {
      this.offersResource.reload();
    } else if (reason === 'tutoring.learner_profile_not_found' || reason === 'tutoring.learner_profile_inactive') {
      this.picker()?.forgetAndReload();
    } else if (reason === 'tutoring.too_many_pending_purchases') {
      this.tooManyPending.set(true);
    }
    this.problem.set(this.translation.t(tutoringErrorKey(error)));
  }
}
