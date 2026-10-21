import { CurrencyPipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowLeft, phosphorLinkSimple } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../core/seo/page-meta';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Modal } from '../../../../shared/modal/modal';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { StatusChip } from '../../../live/instructor/ui/status-chip/status-chip';
import { BangkokTimeRange } from '../../../live/ui/bangkok-time-range/bangkok-time-range';
import { isHttpsUrl } from '../../../live/data/live-instructor.util';
import { TutorDisputeApiService } from '../../data/tutor-dispute-api.service';
import { tutoringErrorKey } from '../../data/tutoring-errors';
import { disputeCategoryLabelKey, disputeResolutionLabelKey, localizedName } from '../../data/tutoring-labels';
import type { EvidenceLink } from '../../data/tutoring-dispute.models';
import type { Guid } from '../../data/tutoring-learner.models';
import { disputeStatusView } from '../../data/tutoring-my.util';
import { startVisibleInterval } from '../../data/visible-interval';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { TUTOR_DISPUTE_LIMITS } from '../ui/tutor-evidence-links-field/tutor-feedback-form.util';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { TutorDisputeReplyForm } from './tutor-dispute-reply-form/tutor-dispute-reply-form';
import { TutorDisputeThread } from './tutor-dispute-thread/tutor-dispute-thread';

const REFRESH_MS = 30_000;

/**
 * `/instructor/tutoring/disputes/:disputeId` (P13-35, signed-in instructor, client-rendered, noindex).
 * Detail of one dispute or attendance appeal from the tutor's view.
 * The tutor sees the learner as a nickname and school level only (never guardian or email).
 * Shows the thread, evidence links, staff decision (if any), reply form (when canPostMessage is true),
 * and withdrawal action (when canWithdraw is true).
 */
@Component({
  selector: 'app-tutor-dispute-detail-page',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    BangkokDatePipe,
    CurrencyThbPipe,
    Button,
    EmptyState,
    Modal,
    Skeleton,
    StatusChip,
    BangkokTimeRange,
    TutorProblem,
    TutorPortalNav,
    TutorDisputeReplyForm,
    TutorDisputeThread,
  ],
  templateUrl: './tutor-dispute-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorArrowLeft, phosphorLinkSimple })],
})
export class TutorDisputeDetailPage {
  private readonly api = inject(TutorDisputeApiService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(TranslationService);
  protected readonly disputeId: Guid = inject(ActivatedRoute).snapshot.paramMap.get('disputeId') ?? '';

  private readonly disputeResource = rxResource({
    params: () => this.disputeId,
    stream: ({ params }) => this.api.getDispute(params),
  });
  protected readonly dispute = computed(() => (this.disputeResource.hasValue() ? this.disputeResource.value() : null));
  protected readonly isLoading = computed(() => this.disputeResource.isLoading() && !this.disputeResource.hasValue());
  protected readonly notFound = computed(() => {
    const error: unknown = this.disputeResource.error();
    return this.disputeResource.status() === 'error' && error instanceof ApiError && error.status === 404;
  });
  protected readonly hasError = computed(() => this.disputeResource.status() === 'error' && !this.notFound());

  protected readonly statusView = computed(() => {
    const dispute = this.dispute();
    return dispute === null ? null : disputeStatusView(dispute.status);
  });
  protected readonly isOpenCase = computed(() => ['Open', 'UnderReview'].includes(this.dispute()?.status ?? ''));
  protected readonly subject = computed(() => {
    const session = this.dispute()?.session;
    return session === undefined ? '' : localizedName({ nameTh: session.subjectNameTh, nameEn: session.subjectNameEn }, this.i18n.locale());
  });
  protected readonly linksLeft = computed(() => Math.max(0, TUTOR_DISPUTE_LIMITS.maxLinks - (this.dispute()?.evidenceLinks.length ?? 0)));

  protected readonly categoryKey = disputeCategoryLabelKey;
  protected readonly resolutionKey = disputeResolutionLabelKey;

  protected readonly withdrawOpen = signal(false);
  protected readonly withdrawing = signal(false);
  protected readonly withdrawProblem = signal<string | null>(null);
  protected readonly announcement = signal('');
  private knownMessages: number | null = null;

  constructor() {
    const i18n = this.i18n;
    setPageMeta({
      title: `${i18n.t('tutoring.tutor.disputes.detail.pageTitle')} | ${i18n.t('common.appName')}`,
      description: i18n.t('tutoring.tutor.disputes.detail.pageDescription'),
      robots: 'noindex',
    });

    afterNextRender(() => {
      const stop = startVisibleInterval(this.document, REFRESH_MS, () => {
        if (this.isOpenCase() && !this.disputeResource.isLoading()) {
          this.disputeResource.reload();
        }
      });
      this.destroyRef.onDestroy(stop);
    });

    effect(() => {
      const count = this.dispute()?.messages.length ?? null;
      untracked(() => {
        if (count !== null && this.knownMessages !== null && count > this.knownMessages) {
          this.announcement.set(this.i18n.t('tutoring.tutor.disputes.thread.newMessage'));
        }
        if (count !== null) {
          this.knownMessages = count;
        }
      });
    });
  }

  protected reload(): void {
    this.disputeResource.reload();
  }

  protected isSafeLink(link: EvidenceLink): boolean {
    return isHttpsUrl(link.url);
  }

  protected withdraw(): void {
    if (this.withdrawing()) {
      return;
    }
    this.withdrawing.set(true);
    this.withdrawProblem.set(null);
    this.api.withdraw(this.disputeId).subscribe({
      next: () => {
        this.withdrawing.set(false);
        this.withdrawOpen.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.disputes.withdraw.done'));
        this.disputeResource.reload();
      },
      error: (error: unknown) => {
        this.withdrawing.set(false);
        this.withdrawProblem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
