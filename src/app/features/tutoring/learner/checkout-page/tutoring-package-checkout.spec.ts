import { Component } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import type { PackagePurchaseDetail } from '../../data/tutoring-package-purchase.models';
import type { TutoringPaymentMethod } from '../../data/tutoring-payment.models';
import { activePurchase, packageCredits, packagePurchase } from '../../testing/package-fixtures';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { paymentState, qrPayment } from '../testing/learner-fixtures';
import { TutoringCheckoutPage } from './tutoring-checkout-page';

/** Stripe.js is never really loaded in a spec: a failed load keeps the panel in its quiet "could not load" state. */
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue(null) }));

@Component({ selector: 'app-route-stub', template: '' })
class RouteStub {}

const PURCHASE_URL = '/api/tutoring/package-purchases/pp-1';
const CONFIG_URL = '/api/tutoring/payments/config';
const CREATE_PAYMENT_URL = '/api/tutoring/package-purchases/pp-1/payment';
const PAYMENT_URL = '/api/tutoring/payments/pay-1';
const PAGE_URL = '/tutoring/checkout/package/pp-1';

const detail = (overrides: Partial<PackagePurchaseDetail> = {}): PackagePurchaseDetail => ({ ...packagePurchase(), credits: [], ...overrides });
const paidDetail = (): PackagePurchaseDetail => ({ ...activePurchase(), credits: packageCredits() });
const packageQr = (): ReturnType<typeof qrPayment> => qrPayment({ kind: 'Package', referenceId: 'pp-1', amount: 4050, holdExpiresAtUtc: '2026-10-14T03:30:00Z' });
const packageState = (overrides: Parameters<typeof paymentState>[0] = {}): ReturnType<typeof paymentState> =>
  paymentState({ kind: 'Package', referenceId: 'pp-1', amount: 4050, ...overrides });

describe('TutoringCheckoutPage paying for a package', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tutoring/checkout/package/:purchaseId', component: TutoringCheckoutPage, data: { checkoutKind: 'Package' } },
          { path: 'tutors/:slug', component: RouteStub },
          { path: 'my-tutoring/packages', component: RouteStub },
          { path: 'my-tutoring/packages/:purchaseId', component: RouteStub },
        ]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';
  const heading = (): string => root().querySelector('#checkout-state-heading')?.textContent?.trim() ?? '';
  const button = (label: string): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes(label))?.querySelector('button') ?? null;
  const link = (label: string): HTMLAnchorElement | null => Array.from(root().querySelectorAll('a')).find((anchor) => anchor.textContent?.includes(label)) ?? null;

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.tick();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function elapse(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
    await settle();
  }

  async function open(answer: PackagePurchaseDetail | { status: number }): Promise<void> {
    await harness.navigateByUrl(PAGE_URL, TutoringCheckoutPage);
    await settle();
    const request = httpMock.expectOne(PURCHASE_URL);
    if ('purchaseId' in answer) {
      request.flush(answer);
    } else {
      request.flush({ title: 'x', reason: 'tutoring.package_purchase_not_found' }, { status: answer.status, statusText: 'x' });
    }
    await settle();
    await settle();
  }

  async function answerConfig(methods: readonly TutoringPaymentMethod[] = ['PromptPay']): Promise<void> {
    httpMock.expectOne(CONFIG_URL).flush({ publishableKey: 'pk_test_123', enabledMethods: methods });
    await settle();
    await settle();
  }

  async function startPromptPay(): Promise<void> {
    await answerConfig();
    button('Pay')?.click();
    await settle();
    httpMock.expectOne(CREATE_PAYMENT_URL).flush(packageQr(), { status: 201, statusText: 'Created' });
    await settle();
    await settle();
  }

  it('shows the package, the server price on the summary and on the pay button, and counts down the payment window', async () => {
    await open(detail());
    await answerConfig();

    expect(heading()).toBe('Choose how to pay');
    expect(text()).toContain('Complete your purchase');
    expect(text()).toContain('10 lessons of 60 minutes');
    expect(text()).toContain('Nina Tutor');
    expect(text()).toContain('Mint');
    expect(button('Pay ฿4,050.00')).not.toBeNull();
    expect(root().querySelector('[role="timer"]')?.textContent).toContain('Time left: 30:00');
    expect(text()).toContain('Lessons not used by the expiry date are not refunded.');
    expect(text()).not.toContain('booking');
  });

  it('starts the payment on the package endpoint with only the method, shows the QR without a booking reference, and activates by the server state', async () => {
    await open(detail());
    await startPromptPay();

    expect(heading()).toBe('Scan to pay');
    expect(root().querySelector('app-promptpay-panel img')?.getAttribute('src')).toBe('https://qr.example.test/pay-1.png');
    expect(text()).not.toContain('Booking TB-');
    expect(text()).toContain('Waiting for your payment...');

    await elapse(3_000);
    httpMock.expectOne(PAYMENT_URL).flush(packageState({ status: 'Pending' }));
    await settle();
    expect(heading()).toBe('Scan to pay');

    await elapse(3_000);
    httpMock.expectOne(PAYMENT_URL).flush(packageState({ status: 'Succeeded' }));
    await settle();
    httpMock.expectOne(PURCHASE_URL).flush(paidDetail());
    await settle();
    await settle();

    expect(heading()).toBe('Your package is ready');
    expect(text()).toContain('Use them before');
    expect(text()).toContain('Lessons not used by the expiry date are not refunded.');
    expect(link('Book a lesson')?.getAttribute('href')).toBe('/my-tutoring/packages/pp-1');
    expect(link('My packages')?.getAttribute('href')).toBe('/my-tutoring/packages');
    await elapse(30_000);
    httpMock.expectNone(PAYMENT_URL);
  });

  it('sends exactly the chosen method and nothing about the price', async () => {
    await open(detail());
    await answerConfig();

    button('Pay')?.click();
    await settle();
    const request = httpMock.expectOne(CREATE_PAYMENT_URL);
    expect(request.request.body).toEqual({ method: 'PromptPay' });
    request.flush(packageQr(), { status: 201, statusText: 'Created' });
    await settle();
  });

  it('guards against a double click on Pay: one payment is created', async () => {
    await open(detail());
    await answerConfig();

    button('Pay')?.click();
    await settle();
    button('Pay')?.click();
    await settle();

    expect(httpMock.match(CREATE_PAYMENT_URL)).toHaveLength(1);
  });

  it('reads a purchase that is already paid as done: no payment methods are read and no payment can be started', async () => {
    await open(paidDetail());

    expect(heading()).toBe('Your package is ready');
    httpMock.expectNone(CONFIG_URL);
    expect(root().querySelector('app-payment-method-choice')).toBeNull();
    expect(button('Pay')).toBeNull();
  });

  it('explains a cancelled purchase instead of offering to pay', async () => {
    await open(detail({ status: 'Cancelled', pendingExpiresAtUtc: null, requiresPayment: false }));

    expect(heading()).toBe('This purchase was not completed');
    expect(text()).toContain('nothing is charged');
    httpMock.expectNone(CONFIG_URL);
  });

  it('says a package whose lessons ran out of time has expired', async () => {
    await open(detail({ status: 'Expired', pendingExpiresAtUtc: null, requiresPayment: false, expiresAtUtc: '2026-10-01T00:00:00Z' }));

    expect(heading()).toBe('This package has expired');
  });

  it('says "not found" for a purchase that is missing or belongs to someone else - the same answer for both', async () => {
    await open({ status: 404 });

    expect(heading()).toBe('Package purchase not found');
    httpMock.expectNone(CONFIG_URL);
  });

  it('shows an error with a retry that reads the purchase again', async () => {
    await open({ status: 500 });

    expect(heading()).toBe('Could not load your purchase');
    button('Try again')?.click();
    await settle();
    httpMock.expectOne(PURCHASE_URL).flush(paidDetail());
    await settle();
    await settle();

    expect(heading()).toBe('Your package is ready');
  });

  it('reads the purchase again when the server says its payment window ended, and then explains it', async () => {
    await open(detail());
    await answerConfig();

    button('Pay')?.click();
    await settle();
    httpMock
      .expectOne(CREATE_PAYMENT_URL)
      .flush({ title: 'x', errorCode: 'conflict', reason: 'tutoring.package_purchase_expired' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('The time to pay for this purchase has run out');
    httpMock.expectOne(PURCHASE_URL).flush(detail({ status: 'Cancelled', pendingExpiresAtUtc: null, requiresPayment: false }));
    await settle();
    await settle();

    expect(heading()).toBe('This purchase was not completed');
  });

  it('says a failed attempt can be retried while the purchase is open, in package words', async () => {
    await open(detail());
    await startPromptPay();

    await elapse(3_000);
    httpMock.expectOne(PAYMENT_URL).flush(packageState({ status: 'Failed' }));
    await settle();
    await settle();

    expect(heading()).toBe('Choose how to pay');
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('while your purchase is still open');
  });

  it('shows a late payment that is being refunded in full, not a package', async () => {
    await open(detail());
    await startPromptPay();

    await elapse(3_000);
    httpMock.expectOne(PAYMENT_URL).flush(packageState({ status: 'Succeeded', lateResolution: 'Refunded' }));
    await settle();
    httpMock.expectOne(PURCHASE_URL).flush(detail({ status: 'Cancelled', pendingExpiresAtUtc: null, requiresPayment: false }));
    await settle();
    await settle();

    expect(heading()).toBe('Your payment is being refunded');
    expect(text()).toContain('the full amount is being returned to you');
    expect(text()).toContain('PromptPay refunds are handled by Stripe');
  });

  it('keeps the countdown on the browser clock: a purchase carries no server time', async () => {
    await open(detail());
    await answerConfig();

    expect(root().querySelector('[role="timer"]')?.textContent).toContain('Time left: 30:00');
    await elapse(60_000);
    expect(root().querySelector('[role="timer"]')?.textContent).toContain('Time left: 29:00');
  });
});
