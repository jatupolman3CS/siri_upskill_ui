import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PayoutPolicy } from './payout-api.models';
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
});
