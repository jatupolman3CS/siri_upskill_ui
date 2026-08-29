import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AdminRefundItem,
  ApproveRefundRequest,
  DismissPaymentOpsRequest,
  PagedAdminRefunds,
  PagedPaymentOps,
  PaymentOpsQueueDto,
  PaymentOpsQueueStatus,
  RejectRefundRequest,
  ResolvePaymentOpsRequest,
} from './admin-payments-api.models';

@Injectable({ providedIn: 'root' })
export class AdminPaymentsApiService {
  private readonly http = inject(HttpClient);

  listOpsQueue(status?: PaymentOpsQueueStatus, page = 1, pageSize = 20): Observable<PagedPaymentOps> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PagedPaymentOps>('/api/commerce/admin/payment-ops', { params });
  }

  getOpsQueueById(id: string): Observable<PaymentOpsQueueDto> {
    return this.http.get<PaymentOpsQueueDto>(`/api/commerce/admin/payment-ops/${id}`);
  }

  assignOpsQueue(id: string): Observable<PaymentOpsQueueDto> {
    return this.http.post<PaymentOpsQueueDto>(`/api/commerce/admin/payment-ops/${id}/assign`, {});
  }

  resolveOpsQueue(id: string, request: ResolvePaymentOpsRequest): Observable<PaymentOpsQueueDto> {
    return this.http.post<PaymentOpsQueueDto>(`/api/commerce/admin/payment-ops/${id}/resolve`, request);
  }

  dismissOpsQueue(id: string, request: DismissPaymentOpsRequest): Observable<PaymentOpsQueueDto> {
    return this.http.post<PaymentOpsQueueDto>(`/api/commerce/admin/payment-ops/${id}/dismiss`, request);
  }

  listPendingRefunds(page = 1, pageSize = 50): Observable<PagedAdminRefunds> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedAdminRefunds>('/api/commerce/admin/refunds/pending', { params });
  }

  approveRefund(refundId: string, request: ApproveRefundRequest): Observable<AdminRefundItem> {
    return this.http.post<AdminRefundItem>(`/api/commerce/admin/refunds/${refundId}/approve`, request);
  }

  rejectRefund(refundId: string, request: RejectRefundRequest): Observable<AdminRefundItem> {
    return this.http.post<AdminRefundItem>(`/api/commerce/admin/refunds/${refundId}/reject`, request);
  }
}
