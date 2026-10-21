import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { tutoringErrorKey, tutoringReasonOf } from '../../data/tutoring-errors';
import { TutoringKycApiService } from '../../data/tutoring-kyc-api.service';
import type { TutorKycStatus } from '../../data/tutoring-kyc.models';
import { kycCaseStatusLabelKey } from '../../data/tutoring-tutor-labels';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { KycConsentStep } from './kyc-consent-step/kyc-consent-step';
import { KycDocumentsStep } from './kyc-documents-step/kyc-documents-step';

const PAGE_PATH = '/instructor/tutoring/kyc';

/**
 * `/instructor/tutoring/kyc` - identity verification (P13-24). Reachable before the tutor is verified (it is how they become
 * verified). Walks the person through consent -> documents -> review, and shows the reviewers' message when more information
 * is needed. The screen only presents the state the server reports; which case may be opened or submitted is the server's call.
 */
@Component({
  selector: 'app-tutor-kyc-page',
  imports: [RouterLink, BangkokDatePipe, TranslatePipe, Button, EmptyState, Skeleton, TutorPortalNav, KycConsentStep, KycDocumentsStep],
  templateUrl: './tutor-kyc-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorKycPage {
  private readonly api = inject(TutoringKycApiService);
  private readonly i18n = inject(TranslationService);

  private readonly resource = rxResource({ stream: () => this.api.getStatus() });
  protected readonly status = computed<TutorKycStatus | null>(() => (this.resource.hasValue() ? this.resource.value() : null));
  protected readonly isLoading = computed(() => this.resource.isLoading() && !this.resource.hasValue());

  /** `503 tutoring.kyc.disabled` (or `enabled: false`) means the feature is switched off, which is not an error to retry. */
  protected readonly disabled = computed(() => {
    const status = this.status();
    return status !== null ? !status.enabled : tutoringReasonOf(this.resource.error()) === 'tutoring.kyc.disabled';
  });
  protected readonly noProfile = computed(() => !this.resource.hasValue() && tutoringReasonOf(this.resource.error()) === 'tutoring.tutor_profile_not_found');
  protected readonly hasError = computed(() => this.resource.status() === 'error' && !this.disabled() && !this.noProfile());
  protected readonly errorText = computed(() => (this.hasError() ? this.i18n.t(tutoringErrorKey(this.resource.error())) : null));

  /** The case being worked on, or `null` when there is none (the next step is then the consent). */
  protected readonly currentCase = computed(() => this.status()?.currentCase ?? null);
  /** Past cases, newest attempt first (the contract promises neither an order nor whether the open case is repeated here). */
  protected readonly history = computed(() =>
    [...(this.status()?.history ?? [])].filter((item) => item.caseId !== this.currentCase()?.caseId).sort((a, b) => b.attemptNo - a.attemptNo),
  );
  protected readonly latestPastNote = computed(() => this.history()[0]?.decisionNote ?? null);

  protected readonly caseStatusKey = kycCaseStatusLabelKey;

  constructor() {
    trackStudioMeta('tutoring.kyc.pageTitle', 'tutoring.kyc.pageDescription', () => PAGE_PATH);
  }

  protected reload(): void {
    this.resource.reload();
  }
}
