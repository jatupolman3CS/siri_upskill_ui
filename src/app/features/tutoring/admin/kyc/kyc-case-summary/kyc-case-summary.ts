import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import type { AdminKycCaseDetail } from '../../data/admin-kyc.models';
import { kycCaseStatusView, tutorStatusView } from '../../data/admin-labels';
import { AdminChip } from '../../ui/admin-chip';

/**
 * The facts of one KYC case above its documents (P13-26): who applied (with a link to the tutor), the attempt, the case and
 * profile states, the PDPA consent the tutor accepted (version + time) and, once decided, who/when/the note the applicant was
 * shown. Presentational only.
 */
@Component({
  selector: 'app-kyc-case-summary',
  imports: [RouterLink, TranslatePipe, BangkokDatePipe, AdminChip],
  template: `
    <section class="glass-card flex flex-col gap-4 rounded-2xl p-5" aria-labelledby="kyc-summary-heading">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 id="kyc-summary-heading" class="break-words text-lg font-semibold text-[var(--color-text)]">{{ detail().tutorDisplayName }}</h2>
          @if (detail().headline) {
            <p class="break-words text-sm text-[var(--color-text-muted)]">{{ detail().headline }}</p>
          }
        </div>
        <app-admin-chip [view]="caseView()" />
      </div>

      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-[var(--color-text-muted)]">{{ 'tutoring.admin.kyc.summary.tutor' | translate }}</dt>
          <dd class="mt-1 flex flex-wrap items-center gap-2">
            <app-admin-chip [view]="tutorView()" />
            <a
              [routerLink]="['/admin/tutoring/tutors', detail().tutorId]"
              class="inline-flex min-h-11 items-center font-semibold text-[var(--color-primary-text)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            >{{ 'tutoring.admin.kyc.summary.tutorLink' | translate }}</a>
          </dd>
        </div>
        <div>
          <dt class="text-[var(--color-text-muted)]">{{ 'tutoring.admin.kyc.summary.attempt' | translate }}</dt>
          <dd class="mt-1 font-semibold text-[var(--color-text)]">{{ detail().attemptNo }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-text-muted)]">{{ 'tutoring.admin.kyc.summary.submitted' | translate }}</dt>
          <dd class="mt-1 text-[var(--color-text)]">{{ detail().submittedAtUtc ? (detail().submittedAtUtc | bangkokDate: 'dateTime') : '-' }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-text-muted)]">{{ 'tutoring.admin.kyc.summary.consent' | translate }}</dt>
          <dd class="mt-1 break-words text-[var(--color-text)]">
            {{ 'tutoring.admin.kyc.summary.consentValue' | translate: { version: detail().consentVersion, date: (detail().consentAtUtc | bangkokDate: 'dateTime') } }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-[var(--color-text-muted)]">{{ 'tutoring.admin.kyc.summary.required' | translate }}</dt>
          <dd class="mt-1 text-[var(--color-text)]">{{ requiredLabels() }}</dd>
        </div>
      </dl>

      @if (detail().decidedAtUtc) {
        <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm text-[var(--color-text)]">
          <p class="font-semibold">{{ 'tutoring.admin.kyc.summary.decidedAt' | translate: { date: (detail().decidedAtUtc | bangkokDate: 'dateTime') } }}</p>
          @if (detail().decisionNote) {
            <p class="mt-1 whitespace-pre-line break-words">{{ detail().decisionNote }}</p>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycCaseSummary {
  private readonly i18n = inject(TranslationService);

  readonly detail = input.required<AdminKycCaseDetail>();

  protected readonly caseView = computed(() => kycCaseStatusView(this.detail().status));
  protected readonly tutorView = computed(() => tutorStatusView(this.detail().tutorStatus));
  protected readonly requiredLabels = computed(() => this.detail().requiredDocumentTypes.map((type) => this.i18n.t(`tutoring.enums.kycDocumentType.${type}`)).join(', '));
}
