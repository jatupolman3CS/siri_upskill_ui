import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
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
import { PayoutBatchItem, REVENUE_SPLIT_STATUSES, RevenueSplitItem, RevenueSplitStatus } from '../../payout/data/payout-api.models';
import { PayoutApiService } from '../../payout/data/payout-api.service';
import { PayoutPolicyStore } from '../../payout/data/payout-policy.store';
import { PayoutPolicyText } from '../../payout/ui/payout-policy-text/payout-policy-text';
import { payoutBatchStatusBadge, revenueSplitStatusBadge } from '../../payout/ui/payout-status-badges';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Modal } from '../../../shared/modal/modal';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-payouts-page',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe, TranslatePipe, Modal, Skeleton, Spinner, PayoutPolicyText],
  templateUrl: './admin-payouts-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
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

  protected readonly activeTab = signal<'batches' | 'splits' | 'refunds'>('batches');

  // Batches State
  protected readonly batches = signal<PayoutBatchItem[]>([]);
  protected readonly totalBatches = signal(0);
  protected readonly isLoadingBatches = signal(false);
  protected readonly showCreateBatchModal = signal(false);
  protected readonly newPeriodKey = signal('');
  protected readonly isSubmittingBatch = signal(false);

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

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.newPeriodKey.set(currentMonthKey);

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
    this.showCreateBatchModal.set(true);
  }

  protected closeCreateBatchModal(): void {
    this.showCreateBatchModal.set(false);
  }

  protected submitCreateBatch(): void {
    const periodKey = this.newPeriodKey().trim();
    if (!periodKey) {
      this.showMessage('error', this.translation.t('admin.payouts.errors.periodKeyRequired'));
      return;
    }

    this.isSubmittingBatch.set(true);
    this.payoutApi.createPayoutBatch({ periodKey }).subscribe({
      next: () => {
        this.isSubmittingBatch.set(false);
        this.closeCreateBatchModal();
        this.showMessage('success', this.translation.t('admin.payouts.messages.batchCreated', { periodKey }));
        this.loadBatches();
      },
      error: (err) => {
        this.isSubmittingBatch.set(false);
        const errorDetail = err?.error?.detail || err?.error?.title || this.translation.t('admin.payouts.errors.createBatch');
        this.showMessage('error', errorDetail);
      },
    });
  }

  // Execute Batch
  protected executeBatch(batch: PayoutBatchItem): void {
    this.payoutApi.executePayoutBatch(batch.id).subscribe({
      next: () => {
        this.showMessage('success', this.translation.t('admin.payouts.messages.batchExecuted', { periodKey: batch.periodKey }));
        this.loadBatches();
      },
      error: (err) => {
        const errorDetail = err?.error?.detail || err?.error?.title || this.translation.t('admin.payouts.errors.executeBatch');
        this.showMessage('error', errorDetail);
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
            this.translation.t('admin.payouts.messages.refundApproved', { amount: refund.amount.toLocaleString() }),
          );
          this.loadRefunds();
        },
        error: (err) => {
          this.isSubmittingApprove.set(false);
          const errorDetail = err?.error?.detail || err?.error?.title || this.translation.t('admin.payouts.errors.approveRefund');
          this.showMessage('error', errorDetail);
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
      error: (err) => {
        this.isSubmittingReject.set(false);
        const errorDetail = err?.error?.detail || err?.error?.title || this.translation.t('admin.payouts.errors.rejectRefund');
        this.showMessage('error', errorDetail);
      },
    });
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
