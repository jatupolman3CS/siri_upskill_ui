import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowCounterClockwise,
  phosphorCalendar,
  phosphorChartPieSlice,
  phosphorCheckCircle,
  phosphorClock,
  phosphorCurrencyDollar,
  phosphorDownloadSimple,
  phosphorHandCoins,
  phosphorMagnifyingGlass,
  phosphorPlay,
  phosphorPlus,
  phosphorQuestion,
  phosphorReceipt,
  phosphorWarning,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import {
  AdminRefundsApiService,
} from './data/admin-refunds-api.service';
import { PendingRefundItem } from './data/admin-refunds-api.models';
import { PayoutBatchItem, PayoutHeldBack, REVENUE_SPLIT_STATUSES, RevenueSplitItem, RevenueSplitStatus } from '../../payout/data/payout-api.models';
import { PayoutApiService } from '../../payout/data/payout-api.service';
import { PayoutPolicyStore } from '../../payout/data/payout-policy.store';
import { PayoutPolicyText } from '../../payout/ui/payout-policy-text/payout-policy-text';
import { payoutBatchStatusBadge, revenueSplitStatusBadge } from '../../payout/ui/payout-status-badges';
import { nothingToPayHeldBackOf, payoutReasonKey, serverMessageOr } from './payout-batch-error.util';
import { PAYOUT_ROUND_TYPES, type PayoutRoundType, defaultPeriodKey, periodKeyIssue, recentIsoWeekKeys } from './payout-period.util';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Modal } from '../../../shared/modal/modal';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Spinner } from '../../../shared/spinner/spinner';

/** How many ISO weeks the dialog offers as quick picks for a tutoring round (the current one and the three before it). */
const RECENT_WEEK_COUNT = 4;

@Component({
  selector: 'app-admin-payouts-page',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe, TranslatePipe, Modal, Skeleton, Spinner, PayoutPolicyText],
  templateUrl: './admin-payouts-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    // Money inside a translated sentence (the held-back notice) is formatted by the same pipe the templates use.
    CurrencyThbPipe,
    // One `GET /api/payout/policy` per page load, shared by the header copy and the create-batch hint.
    PayoutPolicyStore,
    provideIcons({
      phosphorCurrencyDollar,
      phosphorPlus,
      phosphorCheckCircle,
      phosphorDownloadSimple,
      phosphorCalendar,
      phosphorReceipt,
      phosphorWarning,
      phosphorXCircle,
      phosphorPlay,
      phosphorChartPieSlice,
      phosphorMagnifyingGlass,
      // Status badges (payout-status-badges.ts)
      phosphorClock,
      phosphorHandCoins,
      phosphorArrowCounterClockwise,
      phosphorQuestion,
    }),
  ],
})
export class AdminPayoutsPage implements OnInit {
  private readonly payoutApi = inject(PayoutApiService);
  private readonly refundsApi = inject(AdminRefundsApiService);
  private readonly seoService = inject(SeoService);
  private readonly translation = inject(TranslationService);
  private readonly currencyThb = inject(CurrencyThbPipe);

  protected readonly activeTab = signal<'batches' | 'splits' | 'refunds'>('batches');

  // Batches State
  protected readonly batches = signal<PayoutBatchItem[]>([]);
  protected readonly totalBatches = signal(0);
  protected readonly isLoadingBatches = signal(false);
  protected readonly showCreateBatchModal = signal(false);
  /** The kind of round the dialog creates: the monthly course run or the weekly tutoring run. */
  protected readonly roundTypes = PAYOUT_ROUND_TYPES;
  protected readonly newRoundType = signal<PayoutRoundType>('Course');
  /** The key being typed for each kind, kept apart so switching kind never carries a month into a week field or back. */
  private readonly periodKeys = signal<Readonly<Record<PayoutRoundType, string>>>({ Course: '', Tutoring: '' });
  protected readonly newPeriodKey = computed(() => this.periodKeys()[this.newRoundType()]);
  /** Quick picks for a tutoring round: the current ISO week and the ones before it. */
  protected readonly recentWeeks = signal<readonly string[]>([]);
  protected readonly periodKeyError = signal<string | null>(null);
  protected readonly isSubmittingBatch = signal(false);
  protected readonly heldBackNotice = signal<PayoutHeldBack | null>(null);

  // Revenue Splits State
  protected readonly revenueSplits = signal<RevenueSplitItem[]>([]);
  protected readonly totalSplits = signal(0);
  protected readonly isLoadingSplits = signal(false);
  protected readonly splitFilterStatus = signal<RevenueSplitStatus | 'All'>('All');
  /** The only `status` values `GET /api/payout/admin/revenue-splits` accepts — the filter `<option>`s come from here. */
  protected readonly splitStatusOptions = REVENUE_SPLIT_STATUSES.map((value) => ({ value, badge: revenueSplitStatusBadge(value) }));
  protected readonly batchStatusBadge = payoutBatchStatusBadge;
  protected readonly splitStatusBadge = revenueSplitStatusBadge;
  protected readonly splitSearchInstructor = signal('');

  // Refunds State
  protected readonly pendingRefunds = signal<PendingRefundItem[]>([]);
  protected readonly totalRefunds = signal(0);
  protected readonly isLoadingRefunds = signal(false);

  // Approve / Reject Refund Modals
  protected readonly approvingRefund = signal<PendingRefundItem | null>(null);
  protected readonly approveDecisionNote = signal('');
  protected readonly isSubmittingApprove = signal(false);

  protected readonly rejectingRefund = signal<PendingRefundItem | null>(null);
  protected readonly rejectReason = signal('');
  protected readonly isSubmittingReject = signal(false);

  // Feedback State
  protected readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: this.translation.t('admin.payouts.seo.title'),
      description: this.translation.t('admin.payouts.seo.description'),
      path: '/admin/payouts',
      robots: 'noindex',
    });

    this.loadBatches();
    this.loadSplits();
    this.loadRefunds();
  }

  protected loadBatches(): void {
    this.isLoadingBatches.set(true);
    this.payoutApi.getAdminPayoutBatches(1, 50).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.batches.set([...items]);
        this.totalBatches.set(res?.totalCount ?? items.length);
        this.isLoadingBatches.set(false);
      },
      error: () => {
        this.isLoadingBatches.set(false);
      },
    });
  }

  protected loadSplits(): void {
    this.isLoadingSplits.set(true);
    const instructorId = this.splitSearchInstructor().trim() || undefined;
    const status = this.splitFilterStatus() !== 'All' ? this.splitFilterStatus() : undefined;

    this.payoutApi.getAdminRevenueSplits(instructorId, undefined, status, 1, 50).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.revenueSplits.set([...items]);
        this.totalSplits.set(res?.totalCount ?? items.length);
        this.isLoadingSplits.set(false);
      },
      error: () => {
        this.isLoadingSplits.set(false);
      },
    });
  }

  protected onFilterSplits(): void {
    this.loadSplits();
  }

  protected loadRefunds(): void {
    this.isLoadingRefunds.set(true);
    this.refundsApi.getPendingRefunds(1, 50).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.pendingRefunds.set([...items]);
        this.totalRefunds.set(res?.totalCount ?? items.length);
        this.isLoadingRefunds.set(false);
      },
      error: () => {
        this.isLoadingRefunds.set(false);
      },
    });
  }

  // Create Batch
  protected openCreateBatchModal(): void {
    // The suggested keys are read from the clock each time the dialog opens, so a page left open overnight never offers yesterday's.
    const now = Date.now();
    this.periodKeys.set({ Course: defaultPeriodKey('Course', now), Tutoring: defaultPeriodKey('Tutoring', now) });
    this.recentWeeks.set(recentIsoWeekKeys(now, RECENT_WEEK_COUNT));
    this.newRoundType.set('Course');
    this.periodKeyError.set(null);
    this.showCreateBatchModal.set(true);
  }

  protected closeCreateBatchModal(): void {
    this.showCreateBatchModal.set(false);
  }

  protected selectRoundType(type: PayoutRoundType): void {
    this.newRoundType.set(type);
    this.periodKeyError.set(null);
  }

  protected setPeriodKey(value: string): void {
    const type = this.newRoundType();
    this.periodKeys.update((keys) => ({ ...keys, [type]: value }));
    this.periodKeyError.set(null);
  }

  /** The kind a listed round is: a response without `sourceType` is a course round (the field's default on the server). */
  protected roundTypeOf(batch: PayoutBatchItem): PayoutRoundType {
    return batch.sourceType ?? 'Course';
  }

  protected submitCreateBatch(): void {
    const type = this.newRoundType();
    const periodKey = this.newPeriodKey().trim();
    const issue = periodKeyIssue(type, periodKey);
    if (issue !== null) {
      this.periodKeyError.set(
        this.translation.t(issue === 'required' ? 'admin.payouts.errors.periodKeyRequired' : `admin.payouts.errors.periodKeyInvalid${type}`),
      );
      return;
    }

    this.isSubmittingBatch.set(true);
    this.payoutApi.createPayoutBatch({ periodKey, sourceType: type }).subscribe({
      next: (batch) => {
        this.isSubmittingBatch.set(false);
        this.closeCreateBatchModal();
        if (batch?.heldBack && batch.heldBack.tutorCount > 0) {
          this.heldBackNotice.set(batch.heldBack);
        } else {
          this.heldBackNotice.set(null);
        }
        this.showMessage('success', this.translation.t('admin.payouts.messages.batchCreated', { periodKey }));
        this.loadBatches();
      },
      error: (error: unknown) => {
        this.isSubmittingBatch.set(false);
        // "Nothing to pay" because every tutor due was held back is not the same news as "nothing is due": the 409 says how many.
        const heldBack = nothingToPayHeldBackOf(error);
        if (heldBack !== null) {
          this.showMessage(
            'error',
            this.translation.t('admin.payouts.errors.nothingToPayWithHeldBack', {
              tutorCount: heldBack.tutorCount,
              rowCount: heldBack.rowCount,
              amount: this.currencyThb.transform(heldBack.amount) ?? '',
            }),
          );
          return;
        }
        const reasonKey = payoutReasonKey(error);
        this.showMessage(
          'error',
          reasonKey !== null ? this.translation.t(reasonKey) : serverMessageOr(error, this.translation.t('admin.payouts.errors.createBatch')),
        );
      },
    });
  }

  protected refundReasonLabel(reason: string | null | undefined): string {
    if (!reason) return '-';
    const adminKey = `admin.payouts.refunds.reasons.${reason}`;
    const adminLabel = this.translation.t(adminKey);
    if (adminLabel !== adminKey) return adminLabel;
    const tutoringKey = `tutoring.enums.refundReason.${reason}`;
    const tutoringLabel = this.translation.t(tutoringKey);
    if (tutoringLabel !== tutoringKey) return tutoringLabel;
    return reason;
  }

  // Execute Batch
  protected executeBatch(batch: PayoutBatchItem): void {
    this.payoutApi.executePayoutBatch(batch.id).subscribe({
      next: () => {
        this.showMessage('success', this.translation.t('admin.payouts.messages.batchExecuted', { periodKey: batch.periodKey }));
        this.loadBatches();
      },
      error: (error: unknown) => {
        this.showMessage('error', serverMessageOr(error, this.translation.t('admin.payouts.errors.executeBatch')));
      },
    });
  }

  // Export Batch File
  protected exportBatch(batch: PayoutBatchItem): void {
    this.payoutApi.exportPayoutBatch(batch.id).subscribe({
      next: (res) => {
        this.showMessage(
          'success',
          this.translation.t('admin.payouts.messages.batchExported', { periodKey: batch.periodKey, count: res.totalItems }),
        );
      },
      error: () => {
        this.showMessage('error', this.translation.t('admin.payouts.errors.exportBatch'));
      },
    });
  }

  // Approve Refund
  protected openApproveRefundModal(refund: PendingRefundItem): void {
    this.approvingRefund.set(refund);
    this.approveDecisionNote.set('');
  }

  protected closeApproveRefundModal(): void {
    this.approvingRefund.set(null);
  }

  protected submitApproveRefund(): void {
    const refund = this.approvingRefund();
    if (!refund) return;

    this.isSubmittingApprove.set(true);
    this.refundsApi
      .approveRefund(refund.id, { decisionNote: this.approveDecisionNote().trim() || null })
      .subscribe({
        next: () => {
          this.isSubmittingApprove.set(false);
          this.closeApproveRefundModal();
          this.showMessage(
            'success',
            this.translation.t('admin.payouts.messages.refundApproved', { amount: this.currencyThb.transform(refund.amount) ?? '' }),
          );
          this.loadRefunds();
        },
        error: (error: unknown) => {
          this.isSubmittingApprove.set(false);
          this.showMessage('error', serverMessageOr(error, this.translation.t('admin.payouts.errors.approveRefund')));
        },
      });
  }

  // Reject Refund
  protected openRejectRefundModal(refund: PendingRefundItem): void {
    this.rejectingRefund.set(refund);
    this.rejectReason.set('');
  }

  protected closeRejectRefundModal(): void {
    this.rejectingRefund.set(null);
  }

  protected submitRejectRefund(): void {
    const refund = this.rejectingRefund();
    if (!refund) return;

    const reason = this.rejectReason().trim();
    if (!reason) {
      this.showMessage('error', this.translation.t('admin.payouts.errors.rejectReasonRequired'));
      return;
    }

    this.isSubmittingReject.set(true);
    this.refundsApi.rejectRefund(refund.id, { decisionNote: reason }).subscribe({
      next: () => {
        this.isSubmittingReject.set(false);
        this.closeRejectRefundModal();
        this.showMessage('success', this.translation.t('admin.payouts.messages.refundRejected'));
        this.loadRefunds();
      },
      error: (error: unknown) => {
        this.isSubmittingReject.set(false);
        this.showMessage('error', serverMessageOr(error, this.translation.t('admin.payouts.errors.rejectRefund')));
      },
    });
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
