import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PagedResult } from '../../../../core/http/paged-result.model';
import { PaymentAmountOverrideEntry, PaymentAmountOverrideState } from './payment-amount-override.models';
import { PaymentAmountOverrideApiService } from './payment-amount-override-api.service';

const BASE = '/api/commerce/admin/payment-amount-override';

const STATE: PaymentAmountOverrideState = {
  isEnabled: true,
  overrideAmount: 20,
  reason: 'smoke test',
  changedByUserId: 'u-1',
  changedAtUtc: '2026-10-10T03:00:00Z',
};

describe('PaymentAmountOverrideApiService', () => {
  let service: PaymentAmountOverrideApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideHttpClientTesting()] });
    service = TestBed.inject(PaymentAmountOverrideApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getState requests GET on the base path and returns the state as-is', () => {
    let result: PaymentAmountOverrideState | undefined;
    service.getState().subscribe((state) => (result = state));

    const request = httpMock.expectOne(BASE);
    expect(request.request.method).toBe('GET');
    request.flush(STATE);

    expect(result).toEqual(STATE);
  });

  it('getState passes through the never-changed state (everything null)', () => {
    const untouched: PaymentAmountOverrideState = {
      isEnabled: false,
      overrideAmount: null,
      reason: null,
      changedByUserId: null,
      changedAtUtc: null,
    };
    let result: PaymentAmountOverrideState | undefined;
    service.getState().subscribe((state) => (result = state));

    httpMock.expectOne(BASE).flush(untouched);

    expect(result).toEqual(untouched);
  });

  it('update PUTs exactly { isEnabled, overrideAmount, reason } and returns the new state', () => {
    const body = { isEnabled: true, overrideAmount: 20, reason: 'smoke test' };
    let result: PaymentAmountOverrideState | undefined;
    service.update(body).subscribe((state) => (result = state));

    const request = httpMock.expectOne(BASE);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    request.flush(STATE);

    expect(result).toEqual(STATE);
  });

  it('getHistory requests GET /history with page and pageSize query params', () => {
    const entry: PaymentAmountOverrideEntry = {
      id: 'h-1',
      isEnabled: true,
      overrideAmount: 20,
      reason: 'smoke test',
      changedByUserId: 'u-1',
      changedAtUtc: '2026-10-10T03:00:00Z',
    };
    const page: PagedResult<PaymentAmountOverrideEntry> = { items: [entry], totalCount: 1, page: 2, pageSize: 20, totalPages: 1 };
    let result: PagedResult<PaymentAmountOverrideEntry> | undefined;
    service.getHistory(2, 20).subscribe((value) => (result = value));

    const request = httpMock.expectOne(`${BASE}/history?page=2&pageSize=20`);
    expect(request.request.method).toBe('GET');
    request.flush(page);

    expect(result).toEqual(page);
  });
});
