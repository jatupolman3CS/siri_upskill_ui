import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowClockwise,
  phosphorArrowsClockwise,
  phosphorArrowsDownUp,
  phosphorCheckCircle,
  phosphorCreditCard,
  phosphorCurrencyDollar,
  phosphorDotsThree,
  phosphorExclamationMark,
  phosphorEye,
  phosphorFunnel,
  phosphorInfo,
  phosphorMagnifyingGlass,
  phosphorReceipt,
  phosphorShieldCheck,
  phosphorUser,
  phosphorUserCheck,
  phosphorWarning,
  phosphorWarningCircle,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { Spinner } from '../../../shared/spinner/spinner';
import {
  AdminRefundItem,
  PaymentOpsQueueDto,
  PaymentOpsQueueStatus,
  PaymentOpsResolutionAction,
  ResolvePaymentOpsRequest,
} from './data/admin-payments-api.models';
import { AdminPaymentsApiService } from './data/admin-payments-api.service';

@Component({
  selector: 'app-admin-payments-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, CurrencyThbPipe, Spinner],
  templateUrl: './admin-payments-page.html',
  viewProviders: [
    provideIcons({
      phosphorCreditCard,
      phosphorReceipt,
      phosphorWarningCircle,
      phosphorCheckCircle,
      phosphorXCircle,
      phosphorClock: phosphorArrowClockwise,
      phosphorUserCheck,
      phosphorUser,
      phosphorArrowClockwise,
      phosphorArrowsClockwise,
      phosphorArrowsDownUp,
      phosphorMagnifyingGlass,
      phosphorFunnel,
      phosphorInfo,
      phosphorCurrencyDollar,
      phosphorShieldCheck,
      phosphorEye,
      phosphorDotsThree,
      phosphorWarning,
      phosphorExclamationMark,
    }),
  ],
})
export class AdminPaymentsPage implements OnInit {
  private readonly api = inject(AdminPaymentsApiService);

  readonly activeTab = signal<'ops-queue' | 'refunds'>('ops-queue');
  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Ops Queue
  readonly opsEntries = signal<readonly PaymentOpsQueueDto[]>([]);
  readonly opsTotalCount = signal<number>(0);
  readonly opsStatusFilter = signal<PaymentOpsQueueStatus | 'ALL'>('ALL');
  readonly opsPage = signal<number>(1);
  pageSize = 20;

  // Refunds
  readonly pendingRefunds = signal<readonly AdminRefundItem[]>([]);
  readonly refundsTotalCount = signal<number>(0);

  // Modals
  readonly selectedEntryForResolve = signal<PaymentOpsQueueDto | null>(null);
  readonly resolveAction = signal<PaymentOpsResolutionAction>('Refund');
  readonly resolveNote = signal<string>('');
  readonly resolveRefundReason = signal<string>('requested_by_customer');
  readonly isSubmittingResolve = signal<boolean>(false);

  readonly selectedEntryForDismiss = signal<PaymentOpsQueueDto | null>(null);
  readonly dismissNote = signal<string>('');
  readonly isSubmittingDismiss = signal<boolean>(false);

  readonly selectedRefundForAction = signal<{ refund: AdminRefundItem; action: 'approve' | 'reject' } | null>(null);
  readonly refundDecisionNote = signal<string>('');
  readonly isSubmittingRefundAction = signal<boolean>(false);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const statusParam = this.opsStatusFilter() === 'ALL' ? undefined : this.opsStatusFilter();

    this.api.listOpsQueue(statusParam as PaymentOpsQueueStatus, this.opsPage(), this.pageSize).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.opsEntries.set(items);
        this.opsTotalCount.set(res?.totalCount ?? items.length);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.detail || 'เกิดข้อผิดพลาดในการโหลดคิวตรวจสอบการชำระเงิน');
        this.loading.set(false);
      },
    });

    this.api.listPendingRefunds(1, 50).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.pendingRefunds.set(items);
        this.refundsTotalCount.set(res?.totalCount ?? items.length);
      },
      error: () => {
        // Non-blocking for secondary tab
      },
    });
  }

  setTab(tab: 'ops-queue' | 'refunds'): void {
    this.activeTab.set(tab);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  setStatusFilter(status: PaymentOpsQueueStatus | 'ALL'): void {
    this.opsStatusFilter.set(status);
    this.opsPage.set(1);
    this.loadData();
  }

  assignToSelf(entry: PaymentOpsQueueDto): void {
    this.loading.set(true);
    this.api.assignOpsQueue(entry.id).subscribe({
      next: () => {
        this.successMessage.set(`มอบหมายรายการ ${entry.orderNo || entry.paymentId} ให้คุณเรียบร้อยแล้ว`);
        this.loadData();
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.detail || 'ไม่สามารถมอบหมายรายการได้');
        this.loading.set(false);
      },
    });
  }

  openResolveModal(entry: PaymentOpsQueueDto): void {
    this.selectedEntryForResolve.set(entry);
    this.resolveAction.set('Refund');
    this.resolveNote.set('');
    this.resolveRefundReason.set('requested_by_customer');
  }

  closeResolveModal(): void {
    this.selectedEntryForResolve.set(null);
  }

  submitResolve(): void {
    const entry = this.selectedEntryForResolve();
    if (!entry) return;

    this.isSubmittingResolve.set(true);
    const req: ResolvePaymentOpsRequest = {
      action: this.resolveAction(),
      note: this.resolveNote().trim() || null,
      refundReason: this.resolveAction() === 'Refund' ? this.resolveRefundReason() : null,
    };

    this.api.resolveOpsQueue(entry.id, req).subscribe({
      next: () => {
        this.isSubmittingResolve.set(false);
        this.closeResolveModal();
        this.successMessage.set(`ดำเนินการแก้ไขรายการ ${entry.orderNo || entry.paymentId} สำเร็จ`);
        this.loadData();
      },
      error: (err) => {
        this.isSubmittingResolve.set(false);
        this.errorMessage.set(err?.error?.detail || 'ไม่สามารถดำเนินการแก้ไขรายการได้');
      },
    });
  }

  openDismissModal(entry: PaymentOpsQueueDto): void {
    this.selectedEntryForDismiss.set(entry);
    this.dismissNote.set('');
  }

  closeDismissModal(): void {
    this.selectedEntryForDismiss.set(null);
  }

  submitDismiss(): void {
    const entry = this.selectedEntryForDismiss();
    if (!entry || !this.dismissNote().trim()) return;

    this.isSubmittingDismiss.set(true);
    this.api.dismissOpsQueue(entry.id, { note: this.dismissNote().trim() }).subscribe({
      next: () => {
        this.isSubmittingDismiss.set(false);
        this.closeDismissModal();
        this.successMessage.set(`ยกเลิกรายการ ${entry.orderNo || entry.paymentId} เรียบร้อยแล้ว`);
        this.loadData();
      },
      error: (err) => {
        this.isSubmittingDismiss.set(false);
        this.errorMessage.set(err?.error?.detail || 'ไม่สามารถยกเลิกรายการได้');
      },
    });
  }

  openRefundModal(refund: AdminRefundItem, action: 'approve' | 'reject'): void {
    this.selectedRefundForAction.set({ refund, action });
    this.refundDecisionNote.set('');
  }

  closeRefundModal(): void {
    this.selectedRefundForAction.set(null);
  }

  submitRefundAction(): void {
    const item = this.selectedRefundForAction();
    if (!item) return;

    this.isSubmittingRefundAction.set(true);
    const call$ =
      item.action === 'approve'
        ? this.api.approveRefund(item.refund.id, { decisionNote: this.refundDecisionNote().trim() })
        : this.api.rejectRefund(item.refund.id, { decisionNote: this.refundDecisionNote().trim() || 'คำขอถูกปฏิเสธโดยผู้ดูแลระบบ' });

    call$.subscribe({
      next: () => {
        this.isSubmittingRefundAction.set(false);
        this.closeRefundModal();
        this.successMessage.set(
          item.action === 'approve' ? 'อนุมัติคำขอคืนเงินเรียบร้อยแล้ว' : 'ปฏิเสธคำขอคืนเงินเรียบร้อยแล้ว'
        );
        this.loadData();
      },
      error: (err) => {
        this.isSubmittingRefundAction.set(false);
        this.errorMessage.set(err?.error?.detail || 'ไม่สามารถดำเนินการคำขอคืนเงินได้');
      },
    });
  }
}
