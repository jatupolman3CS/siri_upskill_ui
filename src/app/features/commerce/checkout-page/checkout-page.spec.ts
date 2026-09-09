import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, WritableSignal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { OrderDetailResponse, PaymentResponse } from '../data/commerce-api.models';
import { CheckoutPage } from './checkout-page';

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
});
