import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  BatchExportResponse,
  CreatePayoutBatchRequest,
  InstructorEarningsSummary,
  InstructorPayoutAccount,
  PayoutBatchItem,
  PayoutHistoryItem,
  RevenueSplitItem,
} from './payout-api.models';

export interface PagedResponse<T> {
  readonly items: readonly T[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class PayoutApiService {
  private readonly http = inject(HttpClient);

  // Instructor
  getMyRevenueSplits(page = 1, pageSize = 50): Observable<PagedResponse<RevenueSplitItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<RevenueSplitItem>>('/api/payout/instructor/revenue-splits', { params });
  }

  getMyPayoutAccount(): Observable<InstructorPayoutAccount> {
    return this.http.get<InstructorPayoutAccount>('/api/payout/instructor/payout-account');
  }

  upsertPayoutAccount(req: {
    bankName: string;
    accountNumber: string;
    accountHolderName: string;
    promptPayId?: string;
  }): Observable<InstructorPayoutAccount> {
    return this.http.put<InstructorPayoutAccount>('/api/payout/instructor/payout-account', req);
  }

  getInstructorEarningsSummary(): Observable<InstructorEarningsSummary> {
    return this.http.get<InstructorEarningsSummary>('/api/payout/instructor/earnings/summary');
  }

  getInstructorPayoutHistory(page = 1, pageSize = 50): Observable<PagedResponse<PayoutHistoryItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<PayoutHistoryItem>>('/api/payout/instructor/history', { params });
  }

  // Admin
  getAdminPayoutBatches(page = 1, pageSize = 50): Observable<PagedResponse<PayoutBatchItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<PayoutBatchItem>>('/api/payout/admin/batches', { params });
  }

  createPayoutBatch(req: CreatePayoutBatchRequest): Observable<PayoutBatchItem> {
    return this.http.post<PayoutBatchItem>('/api/payout/admin/batches', req);
  }

  executePayoutBatch(batchId: string): Observable<PayoutBatchItem> {
    return this.http.post<PayoutBatchItem>(`/api/payout/admin/batches/${batchId}/execute`, {});
  }

  exportPayoutBatch(batchId: string): Observable<BatchExportResponse> {
    return this.http.get<BatchExportResponse>(`/api/payout/admin/batches/${batchId}/export`);
  }

  getAdminRevenueSplits(
    instructorId?: string,
    periodKey?: string,
    status?: string,
    page = 1,
    pageSize = 50,
  ): Observable<PagedResponse<RevenueSplitItem>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (instructorId) params = params.set('instructorId', instructorId);
    if (periodKey) params = params.set('periodKey', periodKey);
    if (status && status !== 'All') params = params.set('status', status);
    return this.http.get<PagedResponse<RevenueSplitItem>>('/api/payout/admin/revenue-splits', { params });
  }
}
