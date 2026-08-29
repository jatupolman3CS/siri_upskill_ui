import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ApproveRefundRequest,
  PagedPendingRefunds,
  PendingRefundItem,
  RejectRefundRequest,
} from './admin-refunds-api.models';

@Injectable({ providedIn: 'root' })
export class AdminRefundsApiService {
  private readonly http = inject(HttpClient);

  getPendingRefunds(page = 1, pageSize = 50): Observable<PagedPendingRefunds> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedPendingRefunds>('/api/commerce/admin/refunds/pending', { params });
  }

  approveRefund(refundId: string, request: ApproveRefundRequest): Observable<PendingRefundItem> {
    return this.http.post<PendingRefundItem>(`/api/commerce/admin/refunds/${refundId}/approve`, request);
  }

  rejectRefund(refundId: string, request: RejectRefundRequest): Observable<PendingRefundItem> {
    return this.http.post<PendingRefundItem>(`/api/commerce/admin/refunds/${refundId}/reject`, request);
  }
}
