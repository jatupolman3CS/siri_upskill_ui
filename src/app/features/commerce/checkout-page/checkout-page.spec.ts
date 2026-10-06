import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, WritableSignal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { OrderDetailResponse, PaymentConfigResponse, PaymentResponse } from '../data/commerce-api.models';
import { PENDING_CARD_PAYMENT_ID_STORAGE_KEY } from './card-payment-panel/card-payment-panel';
import { CheckoutPage } from './checkout-page';

const PROMPTPAY_ONLY_CONFIG: PaymentConfigResponse = {
  publishableKey: 'pk_test_unused',
  enabledMethods: ['PromptPay'],
};

const PROMPTPAY_AND_CARD_CONFIG: PaymentConfigResponse = {
  publishableKey: 'pk_test_123',
  enabledMethods: ['PromptPay', 'Card'],
};

/**
 * `order`/`isLoadingOrder`/`orderError` are `protected` signals on `CheckoutPage` — this test
 * seeds them directly instead of going through a real HTTP flush to keep these tests focused on
 * rendering, not on the fetch itself (which is covered separately). `unknown` + an inline shape
 * (matching this codebase's established pattern, see courses-page.spec.ts) keeps this typed
 * instead of reaching for `any`.
 */
function testAccess(page: CheckoutPage): {
  readonly order: WritableSignal<OrderDetailResponse | null>;
  readonly isLoadingOrder: WritableSignal<boolean>;
  readonly orderError: WritableSignal<string | null>;
} {
  return page as unknown as {
    readonly order: WritableSignal<OrderDetailResponse | null>;
    readonly isLoadingOrder: WritableSignal<boolean>;
    readonly orderError: WritableSignal<string | null>;
  };
}

@Component({ template: '' })
class DummyCartComponent {}

registerLocaleData(localeTh);

const SAMPLE_PAYMENT: PaymentResponse = {
  id: 'payment-456',
  orderId: 'order-123',
  method: 'PromptPay',
  amount: 3880,
  status: 'Pending',
  createdAtUtc: '2026-08-21T10:00:00Z',
  clientSecret: 'pi_test_secret',
  qrCodeUrl: 'https://stripe.com/qr/sample.png',
  qrCodeData: '000201010212...',
};

describe('CheckoutPage', () => {
  let fixture: ComponentFixture<CheckoutPage>;
  let component: CheckoutPage;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CheckoutPage],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'cart', component: DummyCartComponent },
        ]),
      ],
    });

    fixture = TestBed.createComponent(CheckoutPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    TestBed.inject(TranslationService).setLocale('th');

    testAccess(component).order.set({
      id: 'order-123',
      orderNo: 'SU-88214',
      subtotalAmount: 3880,
      discountAmount: 0,
      taxAmount: 253.83,
      totalAmount: 3880,
      currency: 'THB',
      status: 'Pending',
      items: [
        {
          id: 'item-1',
          courseId: 'course-1',
          titleSnapshot: 'Digital Marketing ครบวงจร',
          instructorName: 'คุณนภา วงศ์สว่าง',
          unitPrice: 1890,
          lineTotal: 1890,
        },
        {
          id: 'item-2',
          courseId: 'course-2',
          titleSnapshot: 'สร้าง Mobile App ด้วย Flutter',
          instructorName: 'อ.สมชาย ใจดี',
          unitPrice: 1990,
          lineTotal: 1990,
        },
      ],
    });
    testAccess(component).isLoadingOrder.set(false);
    testAccess(component).orderError.set(null);

    fixture.detectChanges();

    // `GET /commerce/payments/config` (P11-09) fires from the constructor alongside the order
    // fetch — every test needs it flushed or `httpMock.verify()` in afterEach fails. Default to
    // Card NOT enabled so every pre-existing PromptPay-focused test below keeps seeing the exact
    // same "coming soon" Card card it always has — proof this task didn't change that behavior.
    httpMock.expectOne('/api/commerce/payments/config').flush(PROMPTPAY_ONLY_CONFIG);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    httpMock.verify();
  });

  it('renders order summary and items correctly', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Digital Marketing ครบวงจร');
    expect(text).toContain('สร้าง Mobile App ด้วย Flutter');
    expect(text).toContain('฿3,880');
  });

  it('renders disabled payment methods with coming soon badge', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Thai QR Payment (PromptPay)');
    expect(text).toContain('บัตรเครดิต / เดบิต');
    expect(text).toContain('ผ่อนชำระ 0%');
    expect(text).toContain('เร็ว ๆ นี้');
  });

  it('toggles e-Tax invoice form fields when checkbox is clicked', () => {
    expect(fixture.nativeElement.textContent).not.toContain('เลขประจำตัวผู้เสียภาษี');

    // Toggle etax
    component.toggleEtax(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('เลขประจำตัวผู้เสียภาษี');
    expect(fixture.nativeElement.textContent).toContain('ชื่อบุคคล / บริษัท');
  });

  it('applies promo code and recalculates total discount', () => {
    component.updatePromoCode('WELCOME300');
    component.applyPromoCode();

    const req = httpMock.expectOne((r) => r.url.includes('/commerce/promo-codes/validate'));
    req.flush({
      isValid: true,
      code: 'WELCOME300',
      discountAmount: 300,
      totalAmount: 3580,
    });
    fixture.detectChanges();

    expect(component.discount()).toBe(300);
    expect(component.total()).toBe(3580);
    expect(fixture.nativeElement.textContent).toContain('ประหยัด ฿300');
  });

  it('initiates payment, displays QR code and begins polling', () => {
    component.initiatePayment();

    const req = httpMock.expectOne('/api/commerce/payments');
    expect(req.request.method).toBe('POST');
    req.flush(SAMPLE_PAYMENT);
    fixture.detectChanges();

    expect(component.payment()).toEqual(SAMPLE_PAYMENT);
    expect(component.paymentPollStatus()).toBe('polling');
    expect(fixture.nativeElement.querySelector('img[alt="PromptPay QR Code"]')).toBeTruthy();
  });

  it('uses the server total including tax instead of recomputing it from subtotal', () => {
    const order = testAccess(component).order()!;
    testAccess(component).order.set({ ...order, totalAmount: 4151.6 });
    expect(component.total()).toBe(4151.6);
  });

  it('does not infer payment success from a zero total on a pending order', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    testAccess(component).order.update((order) => ({ ...order!, totalAmount: 0 }));
    component.initiatePayment();
    httpMock.expectOne('/api/commerce/payments').flush(null, { status: 409, statusText: 'Conflict' });
    expect(component.paymentPollStatus()).toBe('idle');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reprices an order with an existing discount when a new promo code is applied', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    testAccess(component).order.update((order) => ({ ...order!, discountAmount: 100, totalAmount: 3780 }));
    component.appliedPromo.set({ code: 'REPLACE', discountAmount: 500, totalAmount: 3380 });
    component.initiatePayment();
    const replacement = httpMock.expectOne('/api/commerce/orders');
    expect(replacement.request.body).toEqual({ courseIds: ['course-1', 'course-2'], promoCode: 'REPLACE' });
    replacement.flush({ ...testAccess(component).order()!, id: 'repriced-order', discountAmount: 500, totalAmount: 3380 });
    const payment = httpMock.expectOne('/api/commerce/payments');
    expect(payment.request.body.orderId).toBe('repriced-order');
    payment.flush({ ...SAMPLE_PAYMENT, orderId: 'repriced-order', amount: 3380 });
    expect(component.total()).toBe(3380);
  });

  it('opens the order success route after the payment poll confirms success', () => {
    vi.useFakeTimers();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.initiatePayment();
    httpMock.expectOne('/api/commerce/payments').flush(SAMPLE_PAYMENT);
    vi.advanceTimersByTime(3000);
    httpMock.expectOne('/api/commerce/payments/payment-456').flush({ ...SAMPLE_PAYMENT, status: 'Succeeded' });
    expect(navigate).toHaveBeenCalledWith(['/checkout/success', 'order-123'], { replaceUrl: true });
    expect(component.paymentPollStatus()).toBe('succeeded');
    vi.advanceTimersByTime(6000);
    httpMock.expectNone('/api/commerce/payments/payment-456');
  });

  it('shows a payment error when the provider returns no QR image', () => {
    component.initiatePayment();
    httpMock.expectOne('/api/commerce/payments').flush({ ...SAMPLE_PAYMENT, qrCodeUrl: null });
    expect(component.payment()).toBeNull();
    expect(component.paymentError()).toBeTruthy();
    expect(component.currentStep()).toBe('selection');
  });

  it('shows a translated error, not the raw "common.error" i18n key, when payment creation fails without a ProblemDetails body', () => {
    // Regression test: `error.interceptor.ts` deliberately falls back to the i18n KEY
    // 'common.error' (not display text) when the backend response carries no ProblemDetails
    // body — e.g. a bare 401 challenge, which is exactly what happened live against a real
    // backend here. `paymentError` must resolve that key through TranslationService before
    // display; using `err.message` directly leaked the literal string "common.error" onto
    // the checkout screen.
    component.initiatePayment();

    const req = httpMock.expectOne('/api/commerce/payments');
    req.flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(component.paymentError()).not.toBe('common.error');
    expect(component.paymentError()).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    expect(fixture.nativeElement.textContent).not.toContain('common.error');
  });

  it('hides the Card tab (still shows the fixed "coming soon" card, unchanged) when payments config does not include Card', () => {
    // Regression proof for P11-24: this fixture's beforeEach flushed PROMPTPAY_ONLY_CONFIG —
    // the Card option must render exactly as it always has, not as a clickable tab.
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('บัตรเครดิต / เดบิต');
    expect(text).toContain('เร็ว ๆ นี้');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.some((b) => b.textContent?.includes('บัตรเครดิต / เดบิต'))).toBe(false);
  });

  it('shows the statement descriptor disclosure unconditionally, before any payment method is chosen', () => {
    // docs/PAYMENT.md: never shown before this task, for either method — must now always render.
    expect(fixture.nativeElement.textContent).toContain('STRIPE PAYMENTS (THAILAND) LTD');
  });
});

describe('CheckoutPage — Card payment (P11-24)', () => {
  let fixture: ComponentFixture<CheckoutPage>;
  let component: CheckoutPage;
  let httpMock: HttpTestingController;

  const SAMPLE_ORDER: OrderDetailResponse = {
    id: 'order-card-1',
    orderNo: 'SU-99001',
    subtotalAmount: 1890,
    discountAmount: 0,
    taxAmount: 123.7,
    totalAmount: 1890,
    currency: 'THB',
    status: 'Pending',
    items: [
      { id: 'item-1', courseId: 'course-1', titleSnapshot: 'Digital Marketing ครบวงจร', instructorName: 'คุณนภา วงศ์สว่าง', unitPrice: 1890, lineTotal: 1890 },
    ],
  };

  const SAMPLE_CARD_PAYMENT: PaymentResponse = {
    id: 'payment-card-1',
    orderId: 'order-card-1',
    method: 'Card',
    amount: 1890,
    status: 'Pending',
    createdAtUtc: '2026-09-16T10:00:00Z',
    clientSecret: 'pi_card_test_secret',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CheckoutPage],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'cart', component: DummyCartComponent }]),
      ],
    });

    fixture = TestBed.createComponent(CheckoutPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(TranslationService).setLocale('th');

    testAccess(component).order.set(SAMPLE_ORDER);
    testAccess(component).isLoadingOrder.set(false);
    testAccess(component).orderError.set(null);
    fixture.detectChanges();

    httpMock.expectOne('/api/commerce/payments/config').flush(PROMPTPAY_AND_CARD_CONFIG);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    httpMock.verify();
  });

  it('shows an active, clickable Card tab once payments config includes Card', () => {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const cardButton = buttons.find((b) => b.textContent?.includes('บัตรเครดิต / เดบิต'));
    expect(cardButton).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('เร็ว ๆ นี้บัตรเครดิต');
  });

  it('creates a Card payment, enters card_entry (not qr_display), and hides the page-level pay button', () => {
    component.setMethod('Card');
    component.initiatePayment();

    const req = httpMock.expectOne('/api/commerce/payments');
    expect(req.request.body).toEqual({ orderId: 'order-card-1', method: 'Card' });
    req.flush(SAMPLE_CARD_PAYMENT);
    fixture.detectChanges();

    expect(component.payment()?.method).toBe('Card');
    expect(component.currentStep()).toBe('card_entry');
    // No countdown/polling starts yet — the Card flow waits for CardPaymentPanel's own
    // confirmedInline output (see onCardConfirmedInline test below), unlike PromptPay which
    // starts polling immediately after payment creation.
    expect(component.paymentPollStatus()).toBe('idle');
    // The page-level "ชำระเงิน" button must be gone — CardPaymentPanel owns its own pay button.
    const summaryButtons = Array.from(fixture.nativeElement.querySelectorAll('app-button')) as HTMLElement[];
    expect(summaryButtons.some((b) => b.textContent?.includes('checkout.summary.payButton'))).toBe(false);
  });

  it('falls back to polling (never a client-side success) when the panel reports confirmedInline — proves security.md compliance', () => {
    vi.useFakeTimers();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    component.setMethod('Card');
    component.initiatePayment();
    httpMock.expectOne('/api/commerce/payments').flush(SAMPLE_CARD_PAYMENT);
    fixture.detectChanges();

    // Simulate CardPaymentPanel's (confirmedInline) output firing — `onCardConfirmedInline` is
    // `protected`, invoked here as the panel's template binding would call it.
    (component as unknown as { onCardConfirmedInline: () => void }).onCardConfirmedInline();
    fixture.detectChanges();

    // Must NOT have navigated to the success page yet — only GET /payments/{id} decides that.
    expect(navigate).not.toHaveBeenCalledWith(['/checkout/success', 'order-card-1'], { replaceUrl: true });
    expect(component.currentStep()).toBe('card_processing');

    vi.advanceTimersByTime(3000);
    const pollReq = httpMock.expectOne('/api/commerce/payments/payment-card-1');
    expect(pollReq.request.method).toBe('GET');
    pollReq.flush({ ...SAMPLE_CARD_PAYMENT, status: 'Succeeded' });

    expect(navigate).toHaveBeenCalledWith(['/checkout/success', 'order-card-1'], { replaceUrl: true });
  });

  it('surfaces a translated confirmPayment error from the panel without navigating away or hanging', () => {
    component.setMethod('Card');
    component.initiatePayment();
    httpMock.expectOne('/api/commerce/payments').flush(SAMPLE_CARD_PAYMENT);
    fixture.detectChanges();

    (component as unknown as { onCardPaymentError: (message: string) => void }).onCardPaymentError('Your card was declined.');
    fixture.detectChanges();

    // A raw Stripe error message isn't a dictionary key — translation.t() passes it through
    // unchanged (see CardPaymentPanel's own doc comment), so it must still reach the user, not
    // leave the page stuck silently.
    expect(component.paymentError()).toBe('Your card was declined.');
    expect(component.currentStep()).toBe('card_entry');
  });

  it('leaves the PromptPay flow provably unaffected when Card is also enabled', () => {
    component.setMethod('PromptPay');
    component.initiatePayment();

    const req = httpMock.expectOne('/api/commerce/payments');
    expect(req.request.body).toEqual({ orderId: 'order-card-1', method: 'PromptPay' });
    req.flush({
      id: 'payment-pp-1', orderId: 'order-card-1', method: 'PromptPay', amount: 1890,
      status: 'Pending', createdAtUtc: '2026-09-16T10:00:00Z',
      qrCodeUrl: 'https://stripe.com/qr/sample.png', qrCodeData: '000201...',
    });
    fixture.detectChanges();

    expect(component.currentStep()).toBe('qr_display');
    expect(component.paymentPollStatus()).toBe('polling');
    expect(fixture.nativeElement.querySelector('img[alt="PromptPay QR Code"]')).toBeTruthy();
  });
});

describe('CheckoutPage — resume after 3DS redirect (P11-24)', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'checkout/:orderId', component: CheckoutPage },
          { path: 'cart', component: DummyCartComponent },
        ]),
      ],
    });
    TestBed.inject(TranslationService).setLocale('th');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  /** Established pattern for settling a `RouterTestingHarness`-driven fixture after navigation or
   * an HTTP flush (see `blog-detail-page.spec.ts`'s own `settle()`) — a plain `detectChanges()`
   * alone is not reliably enough to let `afterNextRender`'s callback (this page's resume-after-
   * redirect logic) run before assertions. */
  async function settle(harness: RouterTestingHarness): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  function flushInitialRequests(orderId: string): void {
    httpMock.expectOne(`/api/commerce/orders/${orderId}`).flush({
      id: orderId, orderNo: 'SU-RESUME', subtotalAmount: 1890, discountAmount: 0, taxAmount: 0,
      totalAmount: 1890, currency: 'THB', status: 'AwaitingPayment', items: [],
    });
    httpMock.expectOne('/api/commerce/payments/config').flush(PROMPTPAY_AND_CARD_CONFIG);
  }

  it('reads the pending payment id from sessionStorage, clears it, and starts polling instead of trusting redirect_status', async () => {
    // Fake timers must be installed BEFORE the resume flow runs — `startPaymentPolling()`'s
    // `setInterval` is created synchronously inside `afterNextRender`'s callback (during the
    // `settle()` calls below), and `vi.advanceTimersByTime()` only affects intervals created
    // after `useFakeTimers()` is active. Native Promise microtasks (what `settle()` awaits) are
    // unaffected by Vitest's fake timers, so this doesn't break the settle helper.
    vi.useFakeTimers();
    sessionStorage.setItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY, 'payment-resumed-1');

    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/checkout/order-resume-1?redirect_status=succeeded', CheckoutPage);
    await settle(harness);

    flushInitialRequests('order-resume-1');
    await settle(harness);

    expect(sessionStorage.getItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY)).toBeNull();
    expect(component.currentStep()).toBe('card_processing');

    vi.advanceTimersByTime(3000);
    const pollReq = httpMock.expectOne('/api/commerce/payments/payment-resumed-1');
    expect(pollReq.request.method).toBe('GET');
    pollReq.flush({
      id: 'payment-resumed-1', orderId: 'order-resume-1', method: 'Card', amount: 1890,
      status: 'Pending', createdAtUtc: '2026-09-16T10:00:00Z',
    });
  });

  it('shows a generic resuming state (not a crash) when sessionStorage has no pending payment id', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/checkout/order-resume-2?redirect_status=succeeded', CheckoutPage);
    await settle(harness);

    flushInitialRequests('order-resume-2');
    await settle(harness);

    expect(component.currentStep()).toBe('card_processing');
    expect(harness.routeNativeElement?.textContent).toContain('กำลังตรวจสอบสถานะการชำระเงิน');
    httpMock.expectNone('/api/commerce/payments/undefined');
  });
});
