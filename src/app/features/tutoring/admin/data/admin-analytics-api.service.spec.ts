import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError } from '../../../../core/http/error.interceptor';
import { analyticsOverview, funnelReport, kycAgingReport, retentionReport, revenueReport, searchDemandReport, topTutorsReport } from '../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, problemBody } from '../testing/spec-helpers';
import { ANALYTICS_BUSY_RETRY_MS, AdminAnalyticsApiService } from './admin-analytics-api.service';

const BASE = '/api/tutoring/admin/analytics';

describe('AdminAnalyticsApiService', () => {
  let service: AdminAnalyticsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    service = TestBed.inject(AdminAnalyticsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('reads the revenue report with the period and the step, as GET', () => {
    const received = vi.fn();
    service.getRevenue({ from: '2026-09-15', to: '2026-10-14', granularity: 'Week' }).subscribe(received);

    const req = httpMock.expectOne((r) => r.url === `${BASE}/revenue`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-09-15');
    expect(req.request.params.get('to')).toBe('2026-10-14');
    expect(req.request.params.get('granularity')).toBe('Week');
    req.flush(revenueReport());

    expect(received).toHaveBeenCalledWith(revenueReport());
  });

  it('reads search demand with the period and the number of rows', () => {
    service.getSearchDemand({ from: '2026-09-15', to: '2026-10-14', top: 10 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${BASE}/search-demand`);
    expect(req.request.params.get('top')).toBe('10');
    expect(req.request.params.get('from')).toBe('2026-09-15');
    req.flush(searchDemandReport());
  });

  it('reads retention by month', () => {
    service.getRetention({ fromMonth: '2026-01', toMonth: '2026-09' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${BASE}/retention`);
    expect(req.request.params.get('fromMonth')).toBe('2026-01');
    expect(req.request.params.get('toMonth')).toBe('2026-09');
    req.flush(retentionReport());
  });

  it('reads the funnel for a segment', () => {
    service.getFunnel({ from: '2026-09-15', to: '2026-10-14', segment: 'Paid' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${BASE}/funnel`);
    expect(req.request.params.get('segment')).toBe('Paid');
    req.flush(funnelReport());
  });

  it('reads the top tutors with the ranking and the number of rows', () => {
    service.getTopTutors({ from: '2026-09-15', to: '2026-10-14', sort: 'Rating', top: 50 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${BASE}/top-tutors`);
    expect(req.request.params.get('sort')).toBe('Rating');
    expect(req.request.params.get('top')).toBe('50');
    req.flush(topTutorsReport());
  });

  it('reads the identity-check queue and the overview, which take no parameters', () => {
    service.getKycAging().subscribe();
    const kyc = httpMock.expectOne(`${BASE}/kyc-aging`);
    expect(kyc.request.params.keys()).toEqual([]);
    kyc.flush(kycAgingReport());

    service.getOverview().subscribe();
    const overview = httpMock.expectOne(`${BASE}/overview`);
    expect(overview.request.method).toBe('GET');
    overview.flush(analyticsOverview());
  });

  it('sends no user, tutor or learner identity anywhere - only a period and options', () => {
    service.getRevenue({ from: '2026-09-15', to: '2026-10-14', granularity: 'Day' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${BASE}/revenue`);
    expect(req.request.params.keys().sort()).toEqual(['from', 'granularity', 'to']);
    req.flush(revenueReport());
  });

  describe('a server that is busy preparing other reports', () => {
    const busy = (): object => problemBody(503, 'tutoring.analytics_busy', 'unavailable');

    it('is asked again once, after the wait the server named, and the person never sees the first refusal', async () => {
      vi.useFakeTimers();
      const received = vi.fn();
      const failed = vi.fn();
      service.getOverview().subscribe({ next: received, error: failed });

      httpMock.expectOne(`${BASE}/overview`).flush(busy(), { status: 503, statusText: 'Service Unavailable' });
      httpMock.expectNone(`${BASE}/overview`);
      await vi.advanceTimersByTimeAsync(ANALYTICS_BUSY_RETRY_MS - 1);
      httpMock.expectNone(`${BASE}/overview`);
      await vi.advanceTimersByTimeAsync(1);
      httpMock.expectOne(`${BASE}/overview`).flush(analyticsOverview());

      expect(received).toHaveBeenCalledWith(analyticsOverview());
      expect(failed).not.toHaveBeenCalled();
    });

    it('gives up after that one retry and reports the failure', async () => {
      vi.useFakeTimers();
      const failed = vi.fn();
      service.getKycAging().subscribe({ error: failed });

      httpMock.expectOne(`${BASE}/kyc-aging`).flush(busy(), { status: 503, statusText: 'Service Unavailable' });
      await vi.advanceTimersByTimeAsync(ANALYTICS_BUSY_RETRY_MS);
      httpMock.expectOne(`${BASE}/kyc-aging`).flush(busy(), { status: 503, statusText: 'Service Unavailable' });
      await vi.advanceTimersByTimeAsync(ANALYTICS_BUSY_RETRY_MS * 2);

      httpMock.expectNone(`${BASE}/kyc-aging`);
      expect(failed).toHaveBeenCalledTimes(1);
      expect((failed.mock.calls[0][0] as ApiError).status).toBe(503);
    });

    it('does not retry any other failure - a refused period, a timeout, a forbidden', () => {
      const failures: ApiError[] = [];
      service.getRevenue({ from: '2026-01-01', to: '2026-10-14', granularity: 'Day' }).subscribe({ error: (error: ApiError) => failures.push(error) });

      httpMock
        .expectOne((r) => r.url === `${BASE}/revenue`)
        .flush(problemBody(400, 'tutoring.analytics_range_invalid', 'validation', { maxDays: 92 }), { status: 400, statusText: 'Bad Request' });

      httpMock.expectNone((r) => r.url === `${BASE}/revenue`);
      expect(failures).toHaveLength(1);
      expect(failures[0].status).toBe(400);
    });

    it('does not retry a 503 that is not the busy answer (a timeout)', () => {
      const failed = vi.fn();
      service.getOverview().subscribe({ error: failed });

      httpMock.expectOne(`${BASE}/overview`).flush(problemBody(503, 'tutoring.analytics_timeout', 'unavailable'), { status: 503, statusText: 'Service Unavailable' });

      httpMock.expectNone(`${BASE}/overview`);
      expect(failed).toHaveBeenCalledTimes(1);
    });
  });
});
