import { PagedResult } from '../../../../core/http/paged-result.model';

export type PaymentOpsQueueStatus = 'Open' | 'InProgress' | 'Resolved' | 'Dismissed';

export type PaymentStatus =
  | 'Pending'
  | 'Processing'
  | 'Succeeded'
  | 'Failed'
  | 'Expired'
  | 'Refunded';

export type OrderStatus =
  | 'Pending'
  | 'AwaitingPayment'
  | 'Paid'
  | 'Processing'
  | 'Completed'
  | 'Cancelled'
  | 'Refunded';

export type PaymentOpsResolutionAction =
  | 'Refund'
  | 'ReopenAndFulfillOrder'
  | 'GrantAccessOnly'
  | 'Dismiss';

export interface PaymentOpsQueueDto {
  id: string;
  paymentId: string;
  reason: string;
  status: PaymentOpsQueueStatus;
  assignedToUserId?: string | null;
  resolvedByUserId?: string | null;
  resolvedAtUtc?: string | null;
  note?: string | null;
  orderId?: string | null;
  orderNo?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  amount: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  providerPaymentIntentId?: string | null;
}

export type PagedPaymentOps = PagedResult<PaymentOpsQueueDto>;

export interface ResolvePaymentOpsRequest {
  action: PaymentOpsResolutionAction;
  note?: string | null;
  refundReason?: string | null;
}

export interface DismissPaymentOpsRequest {
  note: string;
}

export interface AdminRefundItem {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAtUtc: string;
  decidedAtUtc?: string | null;
  decisionNote?: string | null;
  completedAtUtc?: string | null;
}

export type PagedAdminRefunds = PagedResult<AdminRefundItem>;

export interface ApproveRefundRequest {
  decisionNote?: string;
}

export interface RejectRefundRequest {
  decisionNote: string;
}
