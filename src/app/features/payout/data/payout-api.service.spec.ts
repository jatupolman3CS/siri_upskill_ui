import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  InstructorPayoutAccount,
  PayoutPolicy,
  REVENUE_SPLIT_STATUSES,
  RevenueSplitStatus,
  UpsertPayoutAccountRequest,
} from './payout-api.models';
import { PayoutApiService } from './payout-api.service';

describe('PayoutApiService', () => {
  let service: PayoutApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideHttpClientTesting()] });
    service = TestBed.inject(PayoutApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getPayoutPolicy() GETs /api/payout/policy and passes the server shape through untouched', () => {
    const body: PayoutPolicy = {
      revenueSharePercent: 80,
      platformSharePercent: 20,
      withholdingTaxPercent: 5,
      minimumPayoutAmount: 750,
      holdDays: 21,
    };
    let received: PayoutPolicy | undefined;
    service.getPayoutPolicy().subscribe((policy) => (received = policy));

    const req = httpMock.expectOne('/api/payout/policy');
    expect(req.request.method).toBe('GET');
    req.flush(body);

    expect(received).toEqual(body);
  });

  it('getMyPayoutAccount() GETs /api/payout/instructor/payout-account and passes the masked server shape through untouched', () => {
    const body: InstructorPayoutAccount = {
      id: 'account-1',
      instructorId: 'instructor-1',
      bankCode: 'KBANK',
      maskedAccountNo: '***-***-7890',
      accountName: 'Somchai Test',
      taxId: '***-***-3456',
      taxPayerType: 'Corporate',
      verifiedAtUtc: null,
    };
    let received: InstructorPayoutAccount | undefined;
    service.getMyPayoutAccount().subscribe((account) => (received = account));

    const req = httpMock.expectOne('/api/payout/instructor/payout-account');
    expect(req.request.method).toBe('GET');
    req.flush(body);

    expect(received).toEqual(body);
  });

  it('upsertPayoutAccount() PUTs the backend command shape {bankCode, accountNo, accountName, taxId, taxPayerType} and nothing else', () => {
    const request: UpsertPayoutAccountRequest = {
      bankCode: 'SCB',
      accountNo: '1234567890',
      accountName: 'Somchai Test',
      taxId: null,
      taxPayerType: 'Individual',
    };
    const response: InstructorPayoutAccount = {
      id: 'account-1',
      instructorId: 'instructor-1',
      bankCode: 'SCB',
      maskedAccountNo: '***-***-7890',
      accountName: 'Somchai Test',
      taxId: null,
      taxPayerType: 'Individual',
      verifiedAtUtc: null,
    };
    let received: InstructorPayoutAccount | undefined;
    service.upsertPayoutAccount(request).subscribe((account) => (received = account));

    const req = httpMock.expectOne('/api/payout/instructor/payout-account');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      bankCode: 'SCB',
      accountNo: '1234567890',
      accountName: 'Somchai Test',
      taxId: null,
      taxPayerType: 'Individual',
    });
    req.flush(response);

    expect(received).toEqual(response);
  });

  describe('getAdminRevenueSplits() status filter', () => {
    function statusParamSentFor(status: RevenueSplitStatus | 'All' | undefined): string | null {
      service.getAdminRevenueSplits(undefined, undefined, status).subscribe();
      const req = httpMock.expectOne((r) => r.url === '/api/payout/admin/revenue-splits');
      expect(req.request.method).toBe('GET');
      const sent = req.request.params.get('status');
      req.flush({ items: [], totalCount: 0, page: 1, pageSize: 50 });
      return sent;
    }

    it('sends every real RevenueSplitStatus member as ?status=', () => {
      for (const status of REVENUE_SPLIT_STATUSES) {
        expect(statusParamSentFor(status)).toBe(status);
      }
    });

    it('sends no status param for "All" or when no status is chosen', () => {
      expect(statusParamSentFor('All')).toBeNull();
      expect(statusParamSentFor(undefined)).toBeNull();
    });

    it('never sends a value the backend would reject with 400 (old UI states such as Voided)', () => {
      // Widen through `string` first: a stale literal is not assignable to the union, which is the point of the guard.
      expect(statusParamSentFor('Voided' as string as RevenueSplitStatus)).toBeNull();
      expect(statusParamSentFor('' as string as RevenueSplitStatus)).toBeNull();
    });
  });
});
