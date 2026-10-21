import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowRight, phosphorInfo, phosphorListChecks } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { tutoringErrorKey, tutoringReasonOf } from '../../data/tutoring-errors';
import { TutoringKycApiService } from '../../data/tutoring-kyc-api.service';
import { type OnboardingStep, onboardingStep, profileBlockers, reviewerMessage } from '../tutor-onboarding.util';
import { readinessBlockerKey, readinessBlockerRoute } from '../../data/tutoring-tutor-labels';
import { TutoringTutorApiService } from '../../data/tutoring-tutor-api.service';
import type { TutorProfile } from '../../data/tutoring-tutor.models';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { TutorStatusBadge } from '../ui/tutor-status-badge/tutor-status-badge';

const PAGE_PATH = '/instructor/tutoring';
const PROFILE_ROUTE = '/instructor/tutoring/profile';
const KYC_ROUTE = '/instructor/tutoring/kyc';

/** Where each step's one call to action leads (`null` = nothing to do but wait). */
const STEP_ROUTE: Readonly<Record<OnboardingStep, string | null>> = {
  createProfile: PROFILE_ROUTE,
  completeProfile: PROFILE_ROUTE,
  startVerification: KYC_ROUTE,
  continueVerification: KYC_ROUTE,
  awaitingReview: null,
  needsInfo: KYC_ROUTE,
  rejected: KYC_ROUTE,
  verified: null,
  suspended: null,
  verificationUnavailable: null,
};

/**
 * `/instructor/tutoring` - the Tutor Portal hub (P13-24). Shows where the instructor stands on the way to being a verified
 * tutor, what the review team said (when it said something), and the one next action. It is reachable before verification;
 * it only presents the server's state, it decides nothing.
 */
@Component({
  selector: 'app-tutor-onboarding-page',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, Skeleton, TutorPortalNav, TutorProblem, TutorStatusBadge],
  templateUrl: './tutor-onboarding-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowRight, phosphorInfo, phosphorListChecks })],
})
export class TutorOnboardingPage {
  private readonly profileApi = inject(TutoringTutorApiService);
  private readonly kycApi = inject(TutoringKycApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly route = inject(ActivatedRoute);

  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly profileResource = rxResource({ stream: () => this.profileApi.getProfile() });

  /** `404 tutoring.tutor_profile_not_found` is not a failure: the instructor simply has not started yet. */
  protected readonly noProfile = computed(() => {
    const error = this.profileResource.error();
    return !this.profileResource.hasValue() && error instanceof ApiError && tutoringReasonOf(error) === 'tutoring.tutor_profile_not_found';
  });
  protected readonly profile = computed<TutorProfile | null>(() => (this.profileResource.hasValue() ? this.profileResource.value() : null));
  protected readonly profileLoading = computed(() => this.profileResource.isLoading() && !this.profileResource.hasValue());
  protected readonly profileFailed = computed(() => this.profileResource.status() === 'error' && !this.noProfile());

  /** The verification status is only needed while the tutor still has verification ahead of them. */
  private readonly needsKyc = computed(() => {
    const status = this.profile()?.status;
    return status === 'Draft' || status === 'NeedsInfo' || status === 'Rejected';
  });
  private readonly kycResource = rxResource({
    params: () => (this.needsKyc() ? {} : undefined),
    stream: () => this.kycApi.getStatus(),
  });
  protected readonly kycLoading = computed(() => this.needsKyc() && this.kycResource.isLoading() && !this.kycResource.hasValue());
  /** `503 tutoring.kyc.disabled` = the feature is off (not an error); anything else that failed is. */
  private readonly kycDisabled = computed(() => !this.kycResource.hasValue() && tutoringReasonOf(this.kycResource.error()) === 'tutoring.kyc.disabled');
  protected readonly kycFailed = computed(() => this.kycResource.status() === 'error' && !this.kycDisabled());
  private readonly kyc = computed(() => (this.kycResource.hasValue() ? this.kycResource.value() : null));

  protected readonly step = computed<OnboardingStep>(() => onboardingStep(this.profile(), this.kyc()));
  protected readonly actionRoute = computed(() => STEP_ROUTE[this.step()]);
  protected readonly blockers = computed(() => {
    const profile = this.profile();
    return profile ? profileBlockers(profile) : [];
  });
  protected readonly message = computed(() => {
    const profile = this.profile();
    return profile ? reviewerMessage(profile, this.kyc()) : null;
  });
  protected readonly verificationRequired = computed(() => this.queryParams().get('required') === 'verified');

  protected readonly listingBusy = signal(false);
  protected readonly listingProblem = signal<string | null>(null);

  constructor() {
    trackStudioMeta('tutoring.tutor.hub.pageTitle', 'tutoring.tutor.hub.pageDescription', () => PAGE_PATH);
  }

  protected readonly blockerKey = readinessBlockerKey;
  protected readonly blockerRoute = readinessBlockerRoute;

  protected reload(): void {
    this.profileResource.reload();
    this.kycResource.reload();
  }

  /** Opens or pauses the public listing. The server only accepts it for a verified tutor with an active offering. */
  protected toggleListing(): void {
    const profile = this.profile();
    if (!profile || this.listingBusy()) {
      return;
    }
    this.listingBusy.set(true);
    this.listingProblem.set(null);
    this.profileApi.setListing({ isListed: !profile.isListed, rowVersion: profile.rowVersion }).subscribe({
      next: (updated) => {
        this.profileResource.set(updated);
        this.listingBusy.set(false);
        this.toast.success(this.i18n.t(updated.isListed ? 'tutoring.tutor.hub.listing.opened' : 'tutoring.tutor.hub.listing.paused'));
      },
      error: (error: unknown) => {
        this.listingBusy.set(false);
        this.listingProblem.set(this.i18n.t(tutoringErrorKey(error)));
        // A stale token means somebody (or another tab) changed the profile: reload so the next try uses the current one.
        if (tutoringReasonOf(error) === 'tutoring.concurrent_update') {
          this.profileResource.reload();
        }
      },
    });
  }
}
