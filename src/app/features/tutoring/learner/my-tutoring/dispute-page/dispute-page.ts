import { CurrencyPipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
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
import { Modal } from '../../../../../shared/modal/modal';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import { BangkokTimeRange } from '../../../../live/ui/bangkok-time-range/bangkok-time-range';
import { startVisibleInterval } from '../../../data/visible-interval';
import { TutoringDisputeApiService } from '../../../data/tutoring-dispute-api.service';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { disputeCategoryLabelKey, disputeResolutionLabelKey, localizedName } from '../../../data/tutoring-labels';
import type { Guid } from '../../../data/tutoring-learner.models';
import { disputeStatusView } from '../../../data/tutoring-my.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { DISPUTE_LIMITS } from '../feedback-form.util';
import { DisputeReplyForm } from '../dispute-reply-form/dispute-reply-form';
import { DisputeThread } from '../dispute-thread/dispute-thread';
import { EvidenceLinkList } from '../evidence-link-list/evidence-link-list';

/** While a case is open the thread is read again this often (only while the tab is visible), so an answer shows up without a reload. */
const REFRESH_MS = 30_000;

/**
 * `/my-tutoring/disputes/:disputeId` (P13-14, signed-in, client-rendered, `noindex`) - one problem report: what was reported, the
 * evidence, the conversation, and the decision. Every state on it is the server's: whether the learner can answer (`canPostMessage`),
 * withdraw (`canWithdraw`, with the reason when not), whether the class's payment is on hold, and when a decision is expected.
 * The money is explained neutrally - held while the team looks into it, neither paid out nor refunded until a decision - and the
 * decision, once there, is shown as made (the learner never sees administrator notes: the API does not send them).
 * The thread is append-only; a polite status line announces a new message once, the thread itself is not a live region.
 */
@Component({
  selector: 'app-dispute-page',
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
    DisputeReplyForm,
    DisputeThread,
    EvidenceLinkList,
  ],
  templateUrl: './dispute-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorArrowLeft })],
})
export class DisputePage {
  private readonly api = inject(TutoringDisputeApiService);
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
  protected readonly linksLeft = computed(() => Math.max(0, DISPUTE_LIMITS.maxLinks - (this.dispute()?.evidenceLinks.length ?? 0)));

  protected readonly categoryKey = disputeCategoryLabelKey;
  protected readonly resolutionKey = disputeResolutionLabelKey;

  protected readonly withdrawOpen = signal(false);
  protected readonly withdrawing = signal(false);
  protected readonly withdrawProblem = signal<string | null>(null);
  /** One polite sentence when the number of messages grows after the first load (not on every refresh). */
  protected readonly announcement = signal('');
  private knownMessages: number | null = null;

  constructor() {
    const i18n = this.i18n;
    setPageMeta({
      title: `${i18n.t('tutoring.dispute.page.pageTitle')} | ${i18n.t('common.appName')}`,
      description: i18n.t('tutoring.dispute.page.pageDescription'),
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
          this.announcement.set(this.i18n.t('tutoring.dispute.thread.newMessage'));
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
        this.toast.success(this.i18n.t('tutoring.dispute.withdraw.done'));
        this.disputeResource.reload();
      },
      error: (error: unknown) => {
        this.withdrawing.set(false);
        this.withdrawProblem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
