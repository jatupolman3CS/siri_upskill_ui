import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError } from '../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { tutoringAdminErrorKey } from '../data/admin-errors';
import { AdminDisputeApiService } from '../data/admin-dispute-api.service';
import type { AdminDisputeDetail, AdminDisputeMessage } from '../data/admin-dispute.models';
import { OVERDUE_VIEW, disputePriorityView, disputeStatusView } from '../data/admin-labels';
import { AdminChip } from '../ui/admin-chip';
import { AdminConfirmDialog } from '../ui/admin-confirm-dialog';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { DisputeCasePanel } from './dispute-case-panel/dispute-case-panel';
import { DisputeCompensationDialog } from './dispute-compensation-dialog/dispute-compensation-dialog';
import { DisputeContextPanel } from './dispute-context-panel/dispute-context-panel';
import { DisputeDecisionCard } from './dispute-decision-card/dispute-decision-card';
import { DisputeDecisionDialog } from './dispute-decision-dialog/dispute-decision-dialog';
import { DisputeMessageForm } from './dispute-message-form/dispute-message-form';
import { DisputeThread } from './dispute-thread/dispute-thread';
import { isActiveDispute } from './dispute-view.util';

/**
 * `/admin/tutoring/disputes/:disputeId` - one dispute (P13-26): the header with claim / take-over, what was reported, the evidence
 * (attendance, money, the tutor's record), the conversation with internal notes marked as such, a form to write, and the outcome
 * card with the decision dialog. The case is the server's copy; claim, a message, a decision and "compensation settled" each
 * replace or extend it with the answer, and an already-decided / not-decidable answer reloads it with a notice. A closed case
 * (decided, rejected or withdrawn) can no longer be claimed, written to the parties or decided; an internal note stays possible.
 */
@Component({
  selector: 'app-admin-dispute-page',
  imports: [
    RouterLink,
    TranslatePipe,
    BangkokDatePipe,
    Button,
    EmptyState,
    Skeleton,
    AdminChip,
    AdminConfirmDialog,
    AdminTutoringNav,
    DisputeCasePanel,
    DisputeCompensationDialog,
    DisputeContextPanel,
    DisputeDecisionCard,
    DisputeDecisionDialog,
    DisputeMessageForm,
    DisputeThread,
  ],
  templateUrl: './admin-dispute-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDisputePage {
  private readonly api = inject(AdminDisputeApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly disputeId = computed(() => this.params().get('disputeId') ?? '');

  private readonly disputeResource = rxResource({
    params: () => this.disputeId(),
    stream: ({ params }) => this.api.getDispute(params),
  });
  protected readonly detail = linkedSignal<AdminDisputeDetail | null>(() => (this.disputeResource.hasValue() ? this.disputeResource.value() : null));
  protected readonly isLoading = computed(() => this.disputeResource.isLoading() && this.detail() === null);
  protected readonly isMissing = computed(() => {
    const error = this.disputeResource.error();
    return this.disputeResource.status() === 'error' && error instanceof ApiError && error.status === 404;
  });
  protected readonly hasError = computed(() => this.disputeResource.status() === 'error' && !this.isMissing() && this.detail() === null);
  protected readonly errorKey = computed(() => (this.hasError() ? tutoringAdminErrorKey(this.disputeResource.error()) : ''));

  protected readonly active = computed(() => {
    const current = this.detail();
    return current !== null && isActiveDispute(current.status);
  });
  protected readonly myId = computed(() => this.auth.currentUser()?.id ?? null);
  protected readonly heldByOther = computed(() => {
    const current = this.detail();
    return current !== null && current.status === 'UnderReview' && current.assignedToUserId !== null && current.assignedToUserId !== this.myId();
  });

  protected readonly staleNotice = signal<string | null>(null);
  protected readonly claimBusy = signal(false);
  protected readonly claimProblem = signal<string | null>(null);
  protected readonly takeOverOpen = signal(false);
  protected readonly decideOpen = signal(false);
  protected readonly settleOpen = signal(false);

  protected readonly statusView = disputeStatusView;
  protected readonly priorityView = disputePriorityView;
  protected readonly overdueView = OVERDUE_VIEW;

  constructor() {
    trackStudioMeta('tutoring.admin.disputes.detailPageTitle', 'tutoring.admin.disputes.pageDescription', () => `/admin/tutoring/disputes/${this.disputeId()}`);
  }

  protected claim(takeOver: boolean): void {
    const current = this.detail();
    if (current === null || this.claimBusy()) {
      return;
    }
    this.claimBusy.set(true);
    this.claimProblem.set(null);
    this.api.claim(current.disputeId, takeOver).subscribe({
      next: (updated) => {
        this.claimBusy.set(false);
        this.takeOverOpen.set(false);
        this.detail.set(updated);
      },
      error: (error: unknown) => {
        this.claimBusy.set(false);
        this.claimProblem.set(this.i18n.t(tutoringAdminErrorKey(error)));
      },
    });
  }

  /** A message was written: it joins the thread without another round trip (the server's copy of the message). */
  protected appendMessage(message: AdminDisputeMessage): void {
    this.detail.update((current) => (current === null ? current : { ...current, messages: [...current.messages, message] }));
  }

  protected apply(updated: AdminDisputeDetail): void {
    this.staleNotice.set(null);
    this.detail.set(updated);
  }

  protected reloadStale(message: string): void {
    this.staleNotice.set(message);
    this.disputeResource.reload();
  }

  protected reload(): void {
    this.disputeResource.reload();
  }
}
