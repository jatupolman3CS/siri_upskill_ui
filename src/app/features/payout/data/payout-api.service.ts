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
  PayoutPolicy,
  RevenueSplitItem,
  RevenueSplitStatus,
  UpsertPayoutAccountRequest,
  WithholdingTaxCertificate,
  isRevenueSplitStatus,
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

  // Any authenticated user (instructor, applicant, admin) — the figures are caller-aware server-side.
  getPayoutPolicy(): Observable<PayoutPolicy> {
    return this.http.get<PayoutPolicy>('/api/payout/policy');
  }

  // Instructor
  getMyRevenueSplits(page = 1, pageSize = 50): Observable<PagedResponse<RevenueSplitItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<RevenueSplitItem>>('/api/payout/instructor/revenue-splits', { params });
  }

  getMyPayoutAccount(): Observable<InstructorPayoutAccount> {
    return this.http.get<InstructorPayoutAccount>('/api/payout/instructor/payout-account');
  }

  // `GET` answers 404 when this instructor has no account yet — callers treat that as "empty", not as a failure.
  // Upsert: creates the account when none exists, otherwise replaces it (and resets the admin verification).
  // 403 = the caller is not an approved instructor.
  upsertPayoutAccount(req: UpsertPayoutAccountRequest): Observable<InstructorPayoutAccount> {
    return this.http.put<InstructorPayoutAccount>('/api/payout/instructor/payout-account', req);
  }

  getInstructorEarningsSummary(): Observable<InstructorEarningsSummary> {
    return this.http.get<InstructorEarningsSummary>('/api/payout/instructor/earnings/summary');
  }

  getInstructorPayoutHistory(page = 1, pageSize = 50): Observable<PagedResponse<PayoutHistoryItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<PayoutHistoryItem>>('/api/payout/instructor/history', { params });
  }

  // `batchItemId` is a history row's `payoutId`. Ownership is enforced server-side (403 for someone else's item).
  getMyTaxCertificate(batchItemId: string): Observable<WithholdingTaxCertificate> {
    return this.http.get<WithholdingTaxCertificate>(`/api/payout/instructor/tax-certificates/${encodeURIComponent(batchItemId)}`);
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
    status?: RevenueSplitStatus | 'All',
    page = 1,
    pageSize = 50,
  ): Observable<PagedResponse<RevenueSplitItem>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (instructorId) params = params.set('instructorId', instructorId);
    if (periodKey) params = params.set('periodKey', periodKey);
    // The backend binds `status` to the RevenueSplitStatus enum and answers 400 for anything else, so only a real
    // enum member is ever sent ('All' / unknown / stale values mean "no status filter").
    if (isRevenueSplitStatus(status)) params = params.set('status', status);
    return this.http.get<PagedResponse<RevenueSplitItem>>('/api/payout/admin/revenue-splits', { params });
  }
}
