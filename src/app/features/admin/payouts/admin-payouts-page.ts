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
  phosphorCalendar,
  phosphorChartPieSlice,
  phosphorCheckCircle,
  phosphorCurrencyDollar,
  phosphorDownloadSimple,
  phosphorMagnifyingGlass,
  phosphorPlay,
  phosphorPlus,
  phosphorReceipt,
  phosphorWarning,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import {
  AdminRefundsApiService,
} from './data/admin-refunds-api.service';
import { PendingRefundItem } from './data/admin-refunds-api.models';
import { PayoutBatchItem, RevenueSplitItem } from '../../payout/data/payout-api.models';
import { PayoutApiService } from '../../payout/data/payout-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-payouts-page',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe, Skeleton, Spinner],
  templateUrl: './admin-payouts-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
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
    }),
  ],
})
export class AdminPayoutsPage implements OnInit {
  private readonly payoutApi = inject(PayoutApiService);
  private readonly refundsApi = inject(AdminRefundsApiService);
  private readonly seoService = inject(SeoService);

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
  protected readonly splitFilterStatus = signal('All');
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
      title: 'จัดการรอบการจ่ายเงินและคืนเงิน | SIRI UpSkill Admin',
      description: 'ระบบจัดการรอบการจ่ายเงิน ส่วนแบ่งรายได้ผู้สอน และคิวคำขอคืนเงิน',
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
        this.batches.set([...res.items]);
        this.totalBatches.set(res.totalCount);
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
        this.revenueSplits.set([...res.items]);
        this.totalSplits.set(res.totalCount);
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
        this.pendingRefunds.set([...res.items]);
        this.totalRefunds.set(res.totalCount);
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
      this.showMessage('error', 'กรุณาระบุรหัสงวดประจำเดือน (เช่น 2026-08)');
      return;
    }

    this.isSubmittingBatch.set(true);
    this.payoutApi.createPayoutBatch({ periodKey }).subscribe({
      next: () => {
        this.isSubmittingBatch.set(false);
        this.closeCreateBatchModal();
        this.showMessage('success', `สร้างรอบการจ่ายเงินงวด ${periodKey} เรียบร้อยแล้ว`);
        this.loadBatches();
      },
      error: (err) => {
        this.isSubmittingBatch.set(false);
        const errorDetail = err?.error?.detail || err?.error?.title || 'เกิดข้อผิดพลาดในการสร้างรอบจ่ายเงิน';
        this.showMessage('error', errorDetail);
      },
    });
  }

  // Execute Batch
  protected executeBatch(batch: PayoutBatchItem): void {
    this.payoutApi.executePayoutBatch(batch.id).subscribe({
      next: () => {
        this.showMessage('success', `ประมวลผลการจ่ายเงินงวด ${batch.periodKey} สำเร็จ`);
        this.loadBatches();
      },
      error: (err) => {
        const errorDetail = err?.error?.detail || err?.error?.title || 'เกิดข้อผิดพลาดในการประมวลผลการจ่ายเงิน';
        this.showMessage('error', errorDetail);
      },
    });
  }

  // Export Batch File
  protected exportBatch(batch: PayoutBatchItem): void {
    this.payoutApi.exportPayoutBatch(batch.id).subscribe({
      next: (res) => {
        this.showMessage('success', `ส่งออกข้อมูลโอนเงินงวด ${batch.periodKey} จำนวน ${res.totalItems} รายการเรียบร้อยแล้ว`);
      },
      error: () => {
        this.showMessage('error', 'เกิดข้อผิดพลาดในการส่งออกไฟล์โอนเงิน');
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
          this.showMessage('success', `อนุมัติคำขอคืนเงินจำนวน ฿${refund.amount.toLocaleString()} เรียบร้อยแล้ว`);
          this.loadRefunds();
        },
        error: (err) => {
          this.isSubmittingApprove.set(false);
          const errorDetail = err?.error?.detail || err?.error?.title || 'เกิดข้อผิดพลาดในการอนุมัติคืนเงิน';
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
      this.showMessage('error', 'กรุณาระบุเหตุผลในการปฏิเสธคำขอคืนเงิน');
      return;
    }

    this.isSubmittingReject.set(true);
    this.refundsApi.rejectRefund(refund.id, { decisionNote: reason }).subscribe({
      next: () => {
        this.isSubmittingReject.set(false);
        this.closeRejectRefundModal();
        this.showMessage('success', 'ปฏิเสธคำขอคืนเงินเรียบร้อยแล้ว');
        this.loadRefunds();
      },
      error: (err) => {
        this.isSubmittingReject.set(false);
        const errorDetail = err?.error?.detail || err?.error?.title || 'เกิดข้อผิดพลาดในการปฏิเสธคืนเงิน';
        this.showMessage('error', errorDetail);
      },
    });
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
