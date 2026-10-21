import { Injectable } from '@angular/core';
import { Observable, retry, throwError, timer } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import { isAnalyticsBusy } from './admin-analytics-errors';
import type {
  AnalyticsOverview,
  FunnelQuery,
  FunnelReport,
  KycAgingReport,
  RetentionQuery,
  RetentionReport,
  RevenueQuery,
  RevenueReport,
  SearchDemandQuery,
  SearchDemandReport,
  TopTutorsQuery,
  TopTutorsReport,
} from './admin-analytics.models';

const BASE = '/tutoring/admin/analytics';

/**
 * How long to wait before the one automatic retry of a `503 analytics_busy`. The server sends `Retry-After: 5`; the interceptor that
 * turns a failure into an `ApiError` does not keep response headers, so the contract's own 5 seconds is used.
 */
export const ANALYTICS_BUSY_RETRY_MS = 5_000;

/** Retries a busy answer once, after the wait; every other failure goes straight through. */
function retryWhenBusy<T>() {
  return retry<T>({ count: 1, delay: (error: unknown) => (isAnalyticsBusy(error) ? timer(ANALYTICS_BUSY_RETRY_MS) : throwError(() => error)) });
}

/**
 * Administrator analytics endpoints of the tutor marketplace (P13-15 section 6, `AdminOnly`, read-only, `no-store`).
 * Implemented by C# `AdminTutoringAnalyticsController` (`/api/tutoring/admin/analytics/*`). A report that is already being
 * computed by many people at once may answer `503 analytics_busy`: it is asked again once, a few seconds later, before the screen
 * sees a failure. Nothing here computes a figure; a range the server refuses (`400 analytics_range_invalid` + the limit) is explained
 * by the screen, which also checks the same limits before asking.
 */
@Injectable({ providedIn: 'root' })
export class AdminAnalyticsApiService extends ApiService {
  getRevenue(query: RevenueQuery): Observable<RevenueReport> {
    return this.get<RevenueReport>(`${BASE}/revenue`, { from: query.from, to: query.to, granularity: query.granularity }).pipe(retryWhenBusy());
  }

  getSearchDemand(query: SearchDemandQuery): Observable<SearchDemandReport> {
    return this.get<SearchDemandReport>(`${BASE}/search-demand`, { from: query.from, to: query.to, top: query.top }).pipe(retryWhenBusy());
  }

  getRetention(query: RetentionQuery): Observable<RetentionReport> {
    return this.get<RetentionReport>(`${BASE}/retention`, { fromMonth: query.fromMonth, toMonth: query.toMonth }).pipe(retryWhenBusy());
  }

  getFunnel(query: FunnelQuery): Observable<FunnelReport> {
    return this.get<FunnelReport>(`${BASE}/funnel`, { from: query.from, to: query.to, segment: query.segment }).pipe(retryWhenBusy());
  }

  getTopTutors(query: TopTutorsQuery): Observable<TopTutorsReport> {
    return this.get<TopTutorsReport>(`${BASE}/top-tutors`, { from: query.from, to: query.to, sort: query.sort, top: query.top }).pipe(retryWhenBusy());
  }

  getKycAging(): Observable<KycAgingReport> {
    return this.get<KycAgingReport>(`${BASE}/kyc-aging`).pipe(retryWhenBusy());
  }

  getOverview(): Observable<AnalyticsOverview> {
    return this.get<AnalyticsOverview>(`${BASE}/overview`).pipe(retryWhenBusy());
  }
}
