import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import { booking, pagedOf } from '../learner/testing/learner-fixtures';
import { packageDetail, packagePurchase } from '../testing/package-fixtures';
import { tutoringErrorKey } from './tutoring-errors';
import { TutoringPackagePurchaseApiService } from './tutoring-package-purchase-api.service';

describe('TutoringPackagePurchaseApiService', () => {
  let service: TutoringPackagePurchaseApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // withFetch() + the real error interceptor: matches app.config.ts, not the plain XHR default.
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringPackagePurchaseApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts a purchase with POST packages/{id}/purchase, sending only the learner profile - never a price, a tutor or a user', () => {
    const received = vi.fn();
    service.purchase('pkg-1', 'lp-1').subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/packages/pkg-1/purchase');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ learnerProfileId: 'lp-1' });
    req.flush(packagePurchase(), { status: 201, statusText: 'Created' });

    expect(received).toHaveBeenCalledWith(packagePurchase());
  });

  it('encodes the package id it puts in the path', () => {
    service.purchase('a/b c', 'lp-1').subscribe();

    httpMock.expectOne('/api/tutoring/packages/a%2Fb%20c/purchase').flush(packagePurchase());
  });

  it('lists the caller\'s packages with the status and the page, leaving an unset status out', () => {
    const body = pagedOf([packagePurchase()]);
    const received = vi.fn();
    service.listMyPackages({ page: 2, pageSize: 10 }).subscribe(received);

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/packages/my');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.has('status')).toBe(false);
    req.flush(body);

    expect(received).toHaveBeenCalledWith(body);
  });

  it('sends the status filter when there is one', () => {
    service.listMyPackages({ status: 'Active', page: 1, pageSize: 10 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/packages/my');
    expect(req.request.params.get('status')).toBe('Active');
    req.flush(pagedOf([]));
  });

  it('reads one purchase with its credits from GET package-purchases/{id}', () => {
    const received = vi.fn();
    service.getPurchase('pp-1').subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/package-purchases/pp-1');
    expect(req.request.method).toBe('GET');
    req.flush(packageDetail());

    expect(received).toHaveBeenCalledWith(packageDetail());
  });

  it('gives up an unpaid purchase with POST package-purchases/{id}/cancel and an empty body', () => {
    service.cancelPending('pp-1').subscribe();

    const req = httpMock.expectOne('/api/tutoring/package-purchases/pp-1/cancel');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('books a lesson with a credit by POSTing only the start time to package-purchases/{id}/bookings', () => {
    const received = vi.fn();
    service.bookWithCredit('pp-1', '2026-10-20T11:00:00Z').subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/package-purchases/pp-1/bookings');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ startsAtUtc: '2026-10-20T11:00:00Z' });
    const confirmed = booking({ status: 'Confirmed', requiresPayment: false, packagePurchaseId: 'pp-1' });
    req.flush(confirmed, { status: 201, statusText: 'Created' });

    expect(received).toHaveBeenCalledWith(confirmed);
  });

  it('surfaces the server\'s reason for a refusal so the screen can explain it', () => {
    let failure: unknown;
    service.bookWithCredit('pp-1', '2027-02-01T11:00:00Z').subscribe({ error: (error: unknown) => (failure = error) });

    httpMock
      .expectOne('/api/tutoring/package-purchases/pp-1/bookings')
      .flush({ title: 'x', errorCode: 'conflict', reason: 'tutoring.package_session_after_expiry', expiresAtUtc: '2027-01-12T03:05:00Z' }, { status: 409, statusText: 'Conflict' });

    expect(failure).toBeInstanceOf(ApiError);
    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.packageSessionAfterExpiry');
  });
});
