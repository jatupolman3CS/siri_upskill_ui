import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';

import { TranslationService } from '../../../core/i18n/translation.service';
import { PaymentResponse } from '../data/commerce-api.models';
import { CheckoutPage } from './checkout-page';

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
        provideHttpClient(),
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

    (component as any).order.set({
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
          titleSnapshot: 'Digital Marketing ครบวงจร',
          instructorName: 'คุณนภา วงศ์สว่าง',
          unitPrice: 1890,
          lineTotal: 1890,
        },
        {
          id: 'item-2',
          titleSnapshot: 'สร้าง Mobile App ด้วย Flutter',
          instructorName: 'อ.สมชาย ใจดี',
          unitPrice: 1990,
          lineTotal: 1990,
        },
      ],
    });
    (component as any).isLoadingOrder.set(false);
    (component as any).orderError.set(null);

    fixture.detectChanges();
  });

  afterEach(() => {
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
});
