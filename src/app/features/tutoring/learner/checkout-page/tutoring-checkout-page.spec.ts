import { Component } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { Booking } from '../../data/tutoring-learner.models';
import type { TutoringPaymentMethod } from '../../data/tutoring-payment.models';
import { PENDING_TUTORING_PAYMENT_STORAGE_KEY, TutoringCardPanel } from '../../ui/tutoring-card-panel/tutoring-card-panel';
import { booking, cardPayment, confirmedBooking, paymentState, qrPayment } from '../testing/learner-fixtures';
import { TutoringCheckoutPage } from './tutoring-checkout-page';

/** Stripe.js is never really loaded in a spec: a failed load keeps the panel in its quiet "could not load" state. */
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue(null) }));

@Component({ selector: 'app-route-stub', template: '' })
class RouteStub {}

const BOOKING_URL = '/api/tutoring/bookings/b-1';
const CONFIG_URL = '/api/tutoring/payments/config';
const CREATE_PAYMENT_URL = '/api/tutoring/bookings/b-1/payment';
const PAYMENT_URL = '/api/tutoring/payments/pay-1';
const PAGE_URL = '/tutoring/checkout/b-1';

describe('TutoringCheckoutPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tutoring/checkout/:bookingId', component: TutoringCheckoutPage },
          { path: 'tutors/:slug', component: RouteStub },
          { path: 'tutors', component: RouteStub },
        ]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
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

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.tick();
    await Promise.resolve();
    harness.detectChanges();
  }

  /** Lets the fake clock run `ms` and renders; the page's 1 s clock tick and the payment poller both ride on it. */
  async function elapse(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
    await settle();
  }

  const button = (label: string): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes(label))?.querySelector('button') ?? null;
  const link = (label: string): HTMLAnchorElement | null =>
    Array.from(root().querySelectorAll('a')).find((anchor) => anchor.textContent?.includes(label)) ?? null;
  const radios = (): HTMLInputElement[] => Array.from(root().querySelectorAll<HTMLInputElement>('input[type="radio"]'));

  /** Opens the page and answers the booking read. */
  async function open(answer: Booking | { status: number }, url = PAGE_URL): Promise<void> {
    await harness.navigateByUrl(url, TutoringCheckoutPage);
    await settle();
    const request = httpMock.expectOne(BOOKING_URL);
    if ('bookingId' in answer) {
      request.flush(answer);
    } else {
      request.flush({ title: 'x', reason: 'tutoring.booking_not_found' }, { status: answer.status, statusText: 'x' });
    }
    await settle();
    await settle();
  }

  async function answerConfig(methods: readonly TutoringPaymentMethod[] = ['PromptPay']): Promise<void> {
    httpMock.expectOne(CONFIG_URL).flush({ publishableKey: 'pk_test_123', enabledMethods: methods });
    await settle();
    await settle();
  }

  /** From a freshly loaded payable booking: choose PromptPay and start the payment. */
  async function startPromptPay(): Promise<void> {
    await answerConfig();
    button('Pay')?.click();
    await settle();
    httpMock.expectOne(CREATE_PAYMENT_URL).flush(qrPayment(), { status: 201, statusText: 'Created' });
    await settle();
    await settle();
  }

  /**
   * The card panel sits in a `@defer` block: its lazy chunk is read from disk the first time (real I/O) and its
   * `@loading (minimum 150ms)` rides on the faked clock - `vi.waitFor` polls on real timers while advancing the fake one.
   */
  async function cardPanel(): Promise<TutoringCardPanel> {
    await vi.waitFor(
      async () => {
        await elapse(200);
        expect(harness.fixture.debugElement.query(By.directive(TutoringCardPanel))).not.toBeNull();
      },
      { timeout: 4_000, interval: 25 },
    );
    return harness.fixture.debugElement.query(By.directive(TutoringCardPanel)).componentInstance as TutoringCardPanel;
  }

  const createdBodies = (): unknown[] => httpMock.match(CREATE_PAYMENT_URL).map((request) => request.request.body);

  describe('loading and failures', () => {
    it('shows a busy skeleton until the booking arrives', async () => {
      await harness.navigateByUrl(PAGE_URL, TutoringCheckoutPage);
      await settle();

      expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking());
      await settle();
    });

    it('says "not found" for a booking that is missing or belongs to someone else - the same answer for both', async () => {
      await open({ status: 404 });

      expect(heading()).toBe('Booking not found');
      expect(link('Find tutors')?.getAttribute('href') ?? button('Find tutors')).not.toBeNull();
      httpMock.expectNone(CONFIG_URL);
    });

    it('shows an error with a retry that reads the booking again', async () => {
      await open({ status: 500 });

      expect(heading()).toBe('Could not load your booking');
      button('Try again')?.click();
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking());
      await settle();
      await settle();

      expect(heading()).toBe('Your lesson is booked');
    });
  });

  describe('a booking that needs no payment', () => {
    it('confirms a free trial straight away: no payment methods are read, no payment can be started', async () => {
      await open(confirmedBooking({ priceAmount: 0, isTrial: true }));

      expect(heading()).toBe('Your lesson is booked');
      expect(text()).toContain('Your free trial lesson is confirmed.');
      expect(text()).toContain('Free');
      httpMock.expectNone(CONFIG_URL);
      expect(root().querySelector('app-payment-method-choice')).toBeNull();
    });

    it('links to "My lessons" only when that route exists in this build', async () => {
      await open(confirmedBooking());
      expect(link('My lessons')).toBeNull();

      TestBed.inject(Router).resetConfig([...TestBed.inject(Router).config, { path: 'my-tutoring', component: RouteStub }]);
      await harness.navigateByUrl(PAGE_URL, TutoringCheckoutPage);
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking());
      await settle();
      await settle();

      expect(link('My lessons')?.getAttribute('href')).toBe('/my-tutoring');
    });

    it('explains an ended or finalised booking instead of offering to pay', async () => {
      await open(booking({ status: 'Expired', holdExpiresAtUtc: null }));

      expect(heading()).toBe('The time you held has been released');
      expect(root().querySelector('app-payment-method-choice')).toBeNull();
      httpMock.expectNone(CONFIG_URL);
      expect(link('Book this tutor again')?.getAttribute('href')).toBe('/tutors/nina-tutor');
    });
  });

  describe('choosing how to pay', () => {
    it('shows the server price on the summary and on the pay button, the countdown, and PromptPay selected by default', async () => {
      await open(booking());
      await answerConfig();

      expect(heading()).toBe('Choose how to pay');
      expect(button('Pay ฿450.00')).not.toBeNull();
      expect(root().querySelector('[role="timer"]')?.textContent).toContain('Time left: 15:00');
      expect(radios()).toHaveLength(1);
      expect(radios()[0].checked).toBe(true);
      expect(text()).toContain('STRIPE PAYMENTS (THAILAND) LTD');
      expect(text()).toContain('PromptPay refunds are handled by Stripe');
    });

    it('offers card only when the server has switched it on', async () => {
      await open(booking());
      await answerConfig(['PromptPay', 'Card']);

      expect(radios().map((radio) => radio.value)).toEqual(['PromptPay', 'Card']);
    });

    it('starts from card when PromptPay is not on offer', async () => {
      await open(booking());
      await answerConfig(['Card']);

      expect(radios()).toHaveLength(1);
      expect(radios()[0].value).toBe('Card');
      expect(radios()[0].checked).toBe(true);
    });

    it('shows an error with a retry when the payment methods cannot be read', async () => {
      await open(booking());
      httpMock.expectOne(CONFIG_URL).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
      await settle();
      await settle();

      expect(text()).toContain('Could not load the payment methods.');
      expect(button('Pay')).toBeNull();
      button('Try again')?.click();
      await settle();
      await answerConfig();
      expect(button('Pay ฿450.00')).not.toBeNull();
    });
  });

  describe('paying with PromptPay', () => {
    it('sends only the method, shows the QR and confirms by the server state, not by anything the page did', async () => {
      await open(booking());
      await answerConfig();

      button('Pay')?.click();
      await settle();
      const request = httpMock.expectOne(CREATE_PAYMENT_URL);
      expect(request.request.body).toEqual({ method: 'PromptPay' });
      request.flush(qrPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      expect(heading()).toBe('Scan to pay');
      expect(root().querySelector('app-promptpay-panel img')?.getAttribute('src')).toBe('https://qr.example.test/pay-1.png');
      expect(text()).toContain('Waiting for your payment...');

      // Not paid yet: nothing changes, and the page keeps asking at the contract's pace.
      await elapse(3_000);
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Pending' }));
      await settle();
      expect(heading()).toBe('Scan to pay');

      // The signed webhook has confirmed it: now the page re-reads the booking and shows the confirmation.
      await elapse(3_000);
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Succeeded', bookingStatus: 'Confirmed' }));
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking({ paymentId: 'pay-1' }));
      await settle();
      await settle();

      expect(heading()).toBe('Your lesson is booked');
      expect(text()).toContain('Payment received - your lesson is confirmed.');
      await elapse(30_000);
      httpMock.expectNone(PAYMENT_URL);
    });

    it('guards against a double click on Pay: one payment is created', async () => {
      await open(booking());
      await answerConfig();

      button('Pay')?.click();
      await settle();
      button('Pay')?.click();
      await settle();

      expect(httpMock.match(CREATE_PAYMENT_URL)).toHaveLength(1);
    });

    it('never treats the QR image as a result: it stays on the QR step while the server says pending', async () => {
      await open(booking());
      await startPromptPay();

      await elapse(9_000);
      httpMock.match(PAYMENT_URL).forEach((request) => request.flush(paymentState({ status: 'Pending' })));
      await settle();

      expect(heading()).toBe('Scan to pay');
      expect(text()).not.toContain('Your lesson is booked');
    });

    it('goes back to choosing, with a clear message, when the attempt fails; a new attempt can be started', async () => {
      await open(booking());
      await startPromptPay();

      await elapse(3_000);
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Failed' }));
      await settle();
      await settle();

      expect(heading()).toBe('Choose how to pay');
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('The payment was not successful');
      button('Pay')?.click();
      await settle();
      expect(createdBodies()).toEqual([{ method: 'PromptPay' }]);
    });

    it('lets the person pick another method while a QR is showing', async () => {
      await open(booking());
      await answerConfig(['PromptPay', 'Card']);
      button('Pay')?.click();
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(qrPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      button('Choose a different payment method')?.click();
      await settle();

      expect(heading()).toBe('Choose how to pay');
      expect(radios()).toHaveLength(2);
    });
  });

  describe('switching to another method', () => {
    it('stops following the abandoned PromptPay attempt so its late "expired" can never clobber the new card attempt', async () => {
      await open(booking());
      await answerConfig(['PromptPay', 'Card']);
      button('Pay')?.click();
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(qrPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      button('Choose a different payment method')?.click();
      await settle();
      radios()[1].click();
      await settle();
      button('Pay')?.click();
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(cardPayment({ paymentId: 'pay-2' }), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      // The server cancels the old PromptPay payment when the card attempt starts; nothing may read it any more.
      await elapse(12_000);
      httpMock.expectNone(PAYMENT_URL);
      expect(heading()).toBe('Pay by card');
      expect(root().querySelector('[role="alert"]')?.textContent ?? '').not.toContain('expired');
    });
  });

  describe('paying by card', () => {
    it('mounts the card panel with the server client secret, publishable key and a return URL on this page', async () => {
      await open(booking());
      await answerConfig(['PromptPay', 'Card']);
      radios()[1].click();
      await settle();

      button('Pay')?.click();
      await settle();
      const request = httpMock.expectOne(CREATE_PAYMENT_URL);
      expect(request.request.body).toEqual({ method: 'Card' });
      request.flush(cardPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      expect(heading()).toBe('Pay by card');
      const panel = await cardPanel();
      expect(panel.clientSecret()).toBe('pi_secret_1');
      expect(panel.publishableKey()).toBe('pk_test_123');
      expect(panel.paymentId()).toBe('pay-1');
      expect(panel.returnUrl()).toBe(`${location.origin}/tutoring/checkout/b-1`);
    });

    it('waits for the server verdict after the card panel finished - it is not proof of payment', async () => {
      await open(booking());
      await answerConfig(['Card']);
      button('Pay')?.click();
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(cardPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      const panel = await cardPanel();
      panel.confirmedInline.emit();
      await settle();
      await settle();

      expect(text()).toContain('Checking your payment...');
      expect(text()).not.toContain('Your lesson is booked');
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Succeeded', method: 'Card', bookingStatus: 'Confirmed' }));
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking({ paymentId: 'pay-1' }));
      await settle();
      await settle();

      expect(heading()).toBe('Your lesson is booked');
    });

    it('shows a card error from Stripe and keeps the panel for another try', async () => {
      await open(booking());
      await answerConfig(['Card']);
      button('Pay')?.click();
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(cardPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      const panel = await cardPanel();
      panel.paymentError.emit('Your card was declined.');
      await settle();

      expect(root().querySelector('[role="alert"]')?.textContent).toContain('Your card was declined.');
      expect(heading()).toBe('Pay by card');
    });
  });

  describe('refusals when starting a payment', () => {
    async function refuse(reason: string, status = 409): Promise<void> {
      button('Pay')?.click();
      await settle();
      httpMock
        .expectOne(CREATE_PAYMENT_URL)
        .flush({ title: 'x', status, errorCode: 'conflict', reason }, { status, statusText: 'x' });
      await settle();
    }

    it('hold_expired: says so and re-reads the booking, which then shows the ended state', async () => {
      await open(booking());
      await answerConfig();

      await refuse('tutoring.hold_expired');
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('has been released');
      httpMock.expectOne(BOOKING_URL).flush(booking({ status: 'Expired', holdExpiresAtUtc: null }));
      await settle();
      await settle();

      expect(heading()).toBe('The time you held has been released');
    });

    it('booking_already_paid: re-reads the booking instead of showing a dead end', async () => {
      await open(booking());
      await answerConfig();

      await refuse('tutoring.booking_already_paid');
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking());
      await settle();
      await settle();

      expect(heading()).toBe('Your lesson is booked');
    });

    it('payment_in_progress: follows the payment the booking already has instead of starting another', async () => {
      await open(booking({ paymentId: 'pay-1' }));
      // Resuming (the booking already has a payment): the previous attempt is read first.
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Failed' }));
      await settle();
      await answerConfig();

      await refuse('tutoring.payment_in_progress');
      await elapse(0);

      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Succeeded', bookingStatus: 'Confirmed' }));
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking());
      await settle();
      await settle();

      expect(heading()).toBe('Your lesson is booked');
    });

    it('a payment provider outage is explained and can be retried', async () => {
      await open(booking());
      await answerConfig();

      await refuse('tutoring.payment_provider_unavailable', 503);
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('payment service is not responding');

      button('Pay')?.click();
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(qrPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();
      expect(heading()).toBe('Scan to pay');
    });
  });

  describe('the hold clock', () => {
    it('counts down on the server clock, not the device clock', async () => {
      // The device runs 2 minutes ahead of the server: with a 15 minute hold the person still has 15 minutes.
      vi.setSystemTime(new Date('2026-10-14T03:02:00Z'));
      await open(booking());
      await answerConfig();

      expect(root().querySelector('[role="timer"]')?.textContent).toContain('Time left: 15:00');
      await elapse(60_000);
      expect(root().querySelector('[role="timer"]')?.textContent).toContain('Time left: 14:00');
    });

    it('moves to "the time was released" when the hold runs out before any payment was started', async () => {
      await open(booking());
      await answerConfig();

      await elapse(15 * 60_000 + 1_000);

      expect(heading()).toBe('The time you held has been released');
      expect(text()).toContain('we will either confirm the booking or refund the full amount');
      expect(root().querySelector('app-payment-method-choice')).toBeNull();
    });

    it('keeps listening for a short grace period when a payment was in flight, then confirms a payment that landed in time', async () => {
      await open(booking());
      await startPromptPay();

      await elapse(15 * 60_000 + 1_000);
      // Poll answers pending: the page says it is checking instead of declaring the time released.
      httpMock.match(PAYMENT_URL).forEach((request) => request.flush(paymentState({ status: 'Pending' })));
      await settle();
      expect(heading()).toBe('Checking your payment');

      await elapse(3_000);
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Succeeded', bookingStatus: 'Confirmed' }));
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking({ paymentId: 'pay-1' }));
      await settle();
      await settle();

      expect(heading()).toBe('Your lesson is booked');
    });

    it('explains a payment that arrived too late as a full refund, with the PromptPay delay', async () => {
      await open(booking());
      await startPromptPay();

      await elapse(15 * 60_000 + 1_000);
      httpMock.match(PAYMENT_URL).forEach((request) => request.flush(paymentState({ status: 'Pending' })));
      await settle();
      await elapse(3_000);
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Succeeded', lateResolution: 'Refunded' }));
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(booking({ status: 'Expired', holdExpiresAtUtc: null }));
      await settle();
      await settle();

      expect(heading()).toBe('Your payment is being refunded');
      expect(text()).toContain('Amount returned: ฿450.00.');
      expect(text()).toContain('Stripe may email you to ask for your bank account details');
    });

    it('stops listening once the grace period is over, and then says the time was released', async () => {
      await open(booking());
      await startPromptPay();

      await elapse(15 * 60_000 + 91_000);
      httpMock.match(PAYMENT_URL).forEach((request) => request.flush(paymentState({ status: 'Pending' })));
      await settle();
      await elapse(30_000);

      expect(heading()).toBe('The time you held has been released');
      httpMock.expectNone(PAYMENT_URL);
    });
  });

  describe('coming back to the page', () => {
    it('resumes a pending PromptPay attempt: the server hands back the same attempt with a fresh QR', async () => {
      await open(booking({ paymentId: 'pay-1' }));
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Pending', method: 'PromptPay' }));
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(qrPayment(), { status: 200, statusText: 'OK' });
      await settle();
      await answerConfig();

      expect(heading()).toBe('Scan to pay');
      expect(root().querySelector('app-promptpay-panel img')).not.toBeNull();
    });

    it('offers to pay again when the earlier attempt failed', async () => {
      await open(booking({ paymentId: 'pay-1' }));
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Failed' }));
      await settle();
      await answerConfig();

      expect(heading()).toBe('Choose how to pay');
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('The payment was not successful');
    });

    it('ignores a payment that belongs to some other booking', async () => {
      await open(booking({ paymentId: 'pay-1' }));
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Pending', referenceId: 'someone-elses-booking' }));
      await settle();
      await answerConfig();

      expect(heading()).toBe('Choose how to pay');
      httpMock.expectNone(CREATE_PAYMENT_URL);
    });

    it('after a 3-D Secure redirect it never trusts redirect_status: it polls the stored payment id and strips the query', async () => {
      sessionStorage.setItem(PENDING_TUTORING_PAYMENT_STORAGE_KEY, 'pay-1');
      await open(booking({ paymentId: 'pay-1' }), `${PAGE_URL}?payment_intent=pi_x&payment_intent_client_secret=sec&redirect_status=succeeded`);
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Pending', method: 'Card' }));
      await settle();
      await settle();
      await vi.advanceTimersByTimeAsync(0);
      httpMock.expectOne(CONFIG_URL).flush({ publishableKey: 'pk_test_123', enabledMethods: ['PromptPay', 'Card'] });
      await settle();

      expect(text()).toContain('Checking your payment...');
      expect(text()).not.toContain('Your lesson is booked');
      expect(router.url).toBe(PAGE_URL);
      expect(sessionStorage.getItem(PENDING_TUTORING_PAYMENT_STORAGE_KEY)).toBeNull();
      httpMock.expectNone(CREATE_PAYMENT_URL);

      // The redirect only starts the polling (an immediate read); the server state decides.
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Succeeded', method: 'Card', bookingStatus: 'Confirmed' }));
      await settle();
      httpMock.expectOne(BOOKING_URL).flush(confirmedBooking({ paymentId: 'pay-1' }));
      await settle();
      await settle();

      expect(heading()).toBe('Your lesson is booked');
    });

    it('falls back to the booking own payment id when the redirect lost the stored one', async () => {
      await open(booking({ paymentId: 'pay-1' }), `${PAGE_URL}?redirect_status=succeeded`);
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Pending', method: 'Card' }));
      await settle();
      // Resume read the booking's own payment, then the immediate poll reads the same payment again.
      httpMock.expectOne(PAYMENT_URL).flush(paymentState({ status: 'Pending', method: 'Card' }));
      httpMock.expectOne(CONFIG_URL).flush({ publishableKey: 'pk_test_123', enabledMethods: ['PromptPay', 'Card'] });
      await settle();

      expect(text()).toContain('Checking your payment...');
    });
  });

  describe('accessibility', () => {
    it('moves focus to the heading of the new step when the step changes', async () => {
      await open(booking());
      await answerConfig();
      button('Pay')?.click();
      await settle();
      httpMock.expectOne(CREATE_PAYMENT_URL).flush(qrPayment(), { status: 201, statusText: 'Created' });
      await settle();
      await settle();

      expect(document.activeElement?.id).toBe('checkout-state-heading');
      expect(document.activeElement?.textContent?.trim()).toBe('Scan to pay');
    });

    it('announces the countdown by stage through a status region, and leaves the ticking number alone', async () => {
      await open(booking());
      await answerConfig();

      expect(root().querySelector('app-hold-countdown [role="status"]')?.textContent).toContain('Your time is held');
      expect(root().querySelector('app-hold-countdown [role="timer"]')?.getAttribute('aria-live')).toBeNull();
    });
  });
});
