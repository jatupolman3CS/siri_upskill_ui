import { PagedResult } from '../../../../core/http/paged-result.model';

export type RefundStatus = 'Requested' | 'Approved' | 'Rejected' | 'Completed';

export interface PendingRefundItem {
  readonly id: string;
  readonly paymentId: string;
  readonly amount: number;
  readonly reason: string;
  readonly status: RefundStatus | string;
  readonly requestedAtUtc: string;
  readonly decidedAtUtc?: string | null;
  readonly decisionNote?: string | null;
  readonly completedAtUtc?: string | null;
}

export interface ApproveRefundRequest {
  readonly decisionNote?: string | null;
}

export interface RejectRefundRequest {
  readonly decisionNote: string;
}

export type PagedPendingRefunds = PagedResult<PendingRefundItem>;
