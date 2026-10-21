import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import { tutoringErrorKey } from './tutoring-errors';
import { TutoringPaymentApiService } from './tutoring-payment-api.service';
import type { TutoringPayment, TutoringPaymentState } from './tutoring-payment.models';

const PAYMENT: TutoringPayment = {
  paymentId: 'pay-1',
  kind: 'Booking',
  referenceId: 'b-1',
  attemptNo: 1,
  method: 'PromptPay',
  amount: 450,
  currency: 'THB',
  status: 'Pending',
  holdExpiresAtUtc: '2026-10-14T03:15:00Z',
  clientSecret: null,
  qrCodeUrl: 'https://qr.example.test/pay-1.png',
  qrCodeData: '000201010212',
  createdAtUtc: '2026-10-14T03:01:00Z',
};

const STATE: TutoringPaymentState = {
  paymentId: 'pay-1',
  kind: 'Booking',
  referenceId: 'b-1',
  status: 'Succeeded',
  method: 'PromptPay',
  amount: 450,
  refundedCompletedAmount: 0,
  refundPendingAmount: 0,
  lateResolution: 'None',
  bookingStatus: 'Confirmed',
  updatedAtUtc: '2026-10-14T03:05:00Z',
};

describe('TutoringPaymentApiService', () => {
  let service: TutoringPaymentApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringPaymentApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the enabled payment methods and publishable key from GET /tutoring/payments/config', () => {
    const received = vi.fn();
    service.getPaymentConfig().subscribe(received);

    httpMock.expectOne('/api/tutoring/payments/config').flush({ publishableKey: 'pk_test_x', enabledMethods: ['PromptPay', 'Card'] });

    expect(received).toHaveBeenCalledWith({ publishableKey: 'pk_test_x', enabledMethods: ['PromptPay', 'Card'] });
  });

  it('starts a payment with POST bookings/{id}/payment and sends the method only - never an amount', () => {
    const received = vi.fn();
    service.createPayment('b-1', 'PromptPay').subscribe(received);

    const request = httpMock.expectOne('/api/tutoring/bookings/b-1/payment');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ method: 'PromptPay' });
    request.flush(PAYMENT, { status: 201, statusText: 'Created' });

    expect(received).toHaveBeenCalledWith(PAYMENT);
  });

  it('accepts the 200 answer that hands back the same pending attempt', () => {
    const received = vi.fn();
    service.createPayment('b-1', 'PromptPay').subscribe(received);

    httpMock.expectOne('/api/tutoring/bookings/b-1/payment').flush(PAYMENT, { status: 200, statusText: 'OK' });

    expect(received).toHaveBeenCalledWith(PAYMENT);
  });

  it('reads the payment state from GET payments/{id}', () => {
    const received = vi.fn();
    service.getPaymentState('pay-1').subscribe(received);

    const request = httpMock.expectOne('/api/tutoring/payments/pay-1');
    expect(request.request.method).toBe('GET');
    request.flush(STATE);

    expect(received).toHaveBeenCalledWith(STATE);
  });

  it('turns a rate-limit answer into an ApiError with status 429 and a readable message key', () => {
    let failure: unknown;
    service.getPaymentState('pay-1').subscribe({ error: (error: unknown) => (failure = error) });

    httpMock.expectOne('/api/tutoring/payments/pay-1').flush(null, { status: 429, statusText: 'Too Many Requests' });

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(429);
    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.rateLimited');
  });

  it('starts a package payment with POST package-purchases/{id}/payment, sending only the method', () => {
    const received = vi.fn();
    service.createPackagePayment('pp-1', 'PromptPay').subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/package-purchases/pp-1/payment');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ method: 'PromptPay' });
    req.flush({ ...PAYMENT, kind: 'Package', referenceId: 'pp-1', amount: 4050 }, { status: 201, statusText: 'Created' });

    expect(received).toHaveBeenCalledWith({ ...PAYMENT, kind: 'Package', referenceId: 'pp-1', amount: 4050 });
  });

  it('maps a purchase whose payment window ended, and one that is already paid, to their own messages', () => {
    const failures: unknown[] = [];
    service.createPackagePayment('pp-1', 'Card').subscribe({ error: (error: unknown) => failures.push(error) });
    httpMock
      .expectOne('/api/tutoring/package-purchases/pp-1/payment')
      .flush({ title: 'Conflict', errorCode: 'conflict', reason: 'tutoring.package_purchase_expired' }, { status: 409, statusText: 'Conflict' });
    service.createPackagePayment('pp-1', 'Card').subscribe({ error: (error: unknown) => failures.push(error) });
    httpMock
      .expectOne('/api/tutoring/package-purchases/pp-1/payment')
      .flush({ title: 'Conflict', errorCode: 'conflict', reason: 'tutoring.already_paid' }, { status: 409, statusText: 'Conflict' });

    expect(failures.map((failure) => tutoringErrorKey(failure))).toEqual(['tutoring.errors.packagePurchaseExpired', 'tutoring.errors.alreadyPaid']);
  });

  it('maps an expired hold on payment creation to its own message', () => {
    let failure: unknown;
    service.createPayment('b-1', 'Card').subscribe({ error: (error: unknown) => (failure = error) });

    httpMock
      .expectOne('/api/tutoring/bookings/b-1/payment')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.hold_expired' }, { status: 409, statusText: 'Conflict' });

    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.holdExpired');
  });
});
