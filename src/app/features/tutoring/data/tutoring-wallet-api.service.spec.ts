import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TutoringWalletApiService } from './tutoring-wallet-api.service';
import type { TutorWalletResponse } from './tutoring-wallet.models';

const WALLET: TutorWalletResponse = {
  summary: {
    heldAmount: 900,
    frozenAmount: 0,
    availableAmount: 1200,
    processingAmount: 0,
    paidAmount: 4500,
    withholdingTaxPercent: 3,
    estimatedNetAvailable: 1164,
    minimumPayoutAmount: 500,
    meetsMinimum: true,
    hasVerifiedPayoutAccount: true,
    nextPayoutAtUtc: '2026-10-19T03:00:00Z',
    currency: 'THB',
  },
  commissionPercent: 20,
  tutorSharePercent: 80,
  payoutCadence: 'Weekly',
};

describe('TutoringWalletApiService', () => {
  let service: TutoringWalletApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()] });
    service = TestBed.inject(TutoringWalletApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the wallet from GET /tutoring/tutor/wallet - no tutor id anywhere in the request', () => {
    const received = vi.fn();
    service.getWallet().subscribe(received);
    const req = httpMock.expectOne('/api/tutoring/tutor/wallet');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(WALLET);
    expect(received).toHaveBeenCalledWith(WALLET);
  });

  it('pages the ledger and the payouts', () => {
    service.getLedger(2, 10).subscribe();
    const ledger = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/wallet/ledger');
    expect(ledger.request.params.get('page')).toBe('2');
    expect(ledger.request.params.get('pageSize')).toBe('10');
    ledger.flush({ items: [], totalCount: 0, page: 2, pageSize: 10, totalPages: 0 });

    service.getPayouts(1, 10).subscribe();
    const payouts = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/wallet/payouts');
    expect(payouts.request.params.get('page')).toBe('1');
    payouts.flush({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 });
  });
});
