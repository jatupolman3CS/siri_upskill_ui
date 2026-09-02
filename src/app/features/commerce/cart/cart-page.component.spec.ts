import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { accessTokenStore } from '../../../core/http/access-token.store';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { OrderDetailResponse } from '../data/commerce-api.models';
import { CartItem, CartStore } from './cart-store.service';
import { CartPageComponent } from './cart-page.component';

@Component({ selector: 'app-login-stub', template: '' })
class LoginStubPage {}

@Component({ selector: 'app-checkout-stub', template: '' })
class CheckoutStubPage {}

@Component({ selector: 'app-courses-stub', template: '' })
class CoursesStubPage {}

const ITEM_A: CartItem = {
  courseId: 'course-a',
  title: 'Digital Marketing ครบวงจร',
  slug: 'digital-marketing',
  price: 1890,
  thumbnailUrl: null,
  instructorName: 'คุณนภา วงศ์สว่าง',
};

const ITEM_B: CartItem = {
  courseId: 'course-b',
  title: 'สร้าง Mobile App ด้วย Flutter',
  slug: 'flutter-mobile-app',
  price: 1990,
};

/**
 * This test environment doesn't provide a real `localStorage` (Node logs
 * "localStorage is not available because --localstorage-file was not provided" and every
 * `localStorage.*` call throws) — same gap `consent-banner.spec.ts` and `cart-store.service.spec.ts`
 * already work around. Installs a fresh in-memory fake before each test.
 */
const storageBacking: Record<string, string> = {};

function installFakeLocalStorage(): void {
  for (const key of Object.keys(storageBacking)) {
    delete storageBacking[key];
  }

  const fakeLocalStorage: Storage = {
    getItem: (key: string) => storageBacking[key] ?? null,
    setItem: (key: string, value: string) => {
      storageBacking[key] = value;
    },
    removeItem: (key: string) => {
      delete storageBacking[key];
    },
    clear: () => {
      for (const key of Object.keys(storageBacking)) {
        delete storageBacking[key];
      }
    },
    length: 0,
    key: () => null,
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeLocalStorage,
    writable: true,
    configurable: true,
  });
}

registerLocaleData(localeTh);

const SAMPLE_ORDER: OrderDetailResponse = {
  id: 'order-1',
  orderNo: 'SU-90001',
  subtotalAmount: 1890,
  discountAmount: 0,
  taxAmount: 0,
  totalAmount: 1890,
  currency: 'THB',
  status: 'Pending',
  items: [],
};

describe('CartPageComponent', () => {
  let fixture: ComponentFixture<CartPageComponent>;
  let httpMock: HttpTestingController;
  let cart: CartStore;
  let router: Router;

  /** `router.navigate(...)` in `proceedToCheckout()` is called fire-and-forget (not awaited) —
   *  matches the same real timing gap documented in courses-page.spec.ts's own `macrotaskTick()`:
   *  a single microtask turn isn't reliably enough to drain the Router's internal navigation
   *  pipeline, a real macrotask tick is. */
  function macrotaskTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function findButtonByText(text: string): HTMLButtonElement {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((b) =>
      b.textContent?.includes(text),
    );
    if (!button) {
      throw new Error(`No button found containing text "${text}"`);
    }
    return button;
  }

  function setPromoInput(value: string): void {
    const input = fixture.nativeElement.querySelector('#promoInput') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    installFakeLocalStorage();
    accessTokenStore.set(null);

    TestBed.configureTestingModule({
      imports: [CartPageComponent],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: LoginStubPage },
          { path: 'checkout/:orderId', component: CheckoutStubPage },
          { path: 'courses', component: CoursesStubPage },
        ]),
      ],
    });

    TestBed.inject(TranslationService).setLocale('th');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    cart = TestBed.inject(CartStore);
    cart.clearCart();

    fixture = TestBed.createComponent(CartPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    accessTokenStore.set(null);
  });

  it('renders the empty state with a link back to /courses when the cart has no items', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('ยังไม่มีคอร์สเรียนในตะกร้า');
    expect(fixture.nativeElement.querySelector('a[href="/courses"]')).toBeTruthy();
  });

  it('renders cart items and the correct subtotal/total once items are present', () => {
    cart.addItem(ITEM_A);
    cart.addItem(ITEM_B);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Digital Marketing ครบวงจร');
    expect(text).toContain('สร้าง Mobile App ด้วย Flutter');
    expect(text).toContain('฿3,880');
  });

  it('removing an item updates the totals, the rendered list, and localStorage', () => {
    cart.addItem(ITEM_A);
    cart.addItem(ITEM_B);
    fixture.detectChanges();

    const removeButtons = Array.from(
      fixture.nativeElement.querySelectorAll('button[title="ลบออกจากตะกร้า"]') as NodeListOf<HTMLButtonElement>,
    );
    expect(removeButtons.length).toBe(2);
    removeButtons[0].click();
    fixture.detectChanges();

    expect(cart.items().length).toBe(1);
    expect(cart.items()[0].courseId).toBe(ITEM_B.courseId);
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Digital Marketing ครบวงจร');
    expect(text).toContain('฿1,990');

    const stored = JSON.parse(localStorage.getItem('siri_cart_items_v1') ?? '[]');
    expect(stored).toEqual([ITEM_B]);
  });

  it('applies a promo code successfully and shows the discount', () => {
    cart.addItem(ITEM_A);
    fixture.detectChanges();

    setPromoInput('SALE10');
    findButtonByText('ใช้โค้ด').click();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    req.flush({ isValid: true, code: 'SALE10', subtotal: 1890, discountAmount: 300, totalAmount: 1590 });
    fixture.detectChanges();

    expect(cart.discount()).toBe(300);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SALE10');
    expect(text).toContain('฿1,590');
  });

  it('rejects an invalid promo code and shows the backend-provided error message', () => {
    cart.addItem(ITEM_A);
    fixture.detectChanges();

    setPromoInput('EXPIRED');
    findButtonByText('ใช้โค้ด').click();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    req.flush({
      isValid: false,
      code: 'EXPIRED',
      subtotal: 1890,
      discountAmount: 0,
      totalAmount: 1890,
      errorMessage: 'รหัสส่วนลดหมดอายุแล้ว',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('รหัสส่วนลดหมดอายุแล้ว');
    expect(cart.discount()).toBe(0);
  });

  it('shows a translated promo-code error, not the raw "common.error" i18n key, when the request fails without a ProblemDetails body', () => {
    // Regression test matching checkout-page.spec.ts's equivalent: error.interceptor.ts falls back
    // to the i18n KEY 'common.error' (not display text) when the response carries no ProblemDetails
    // body — e.g. a bare 401. This proves the fix reaches the rendered page, not just the store.
    cart.addItem(ITEM_A);
    fixture.detectChanges();

    setPromoInput('SALE10');
    findButtonByText('ใช้โค้ด').click();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    req.flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('common.error');
    expect(text).toContain('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  });

  it('removes an applied promo code from the UI without calling the API', () => {
    cart.addItem(ITEM_A);
    fixture.detectChanges();

    setPromoInput('SALE10');
    findButtonByText('ใช้โค้ด').click();
    httpMock
      .expectOne((r) => r.url === '/api/commerce/promo-codes/validate')
      .flush({ isValid: true, code: 'SALE10', subtotal: 1890, discountAmount: 300, totalAmount: 1590 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('SALE10');

    findButtonByText('ลบ').click();
    fixture.detectChanges();

    expect(cart.appliedPromo()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('SALE10');
    // httpMock.verify() in afterEach proves removing the promo made no further request.
  });

  it('redirects to /login with a returnUrl when checking out while unauthenticated', async () => {
    cart.addItem(ITEM_A);
    fixture.detectChanges();

    findButtonByText('ดำเนินการชำระเงิน').click();
    fixture.detectChanges();
    await macrotaskTick();

    expect(router.url.startsWith('/login')).toBe(true);
    expect(decodeURIComponent(router.url)).toContain('returnUrl=/cart');
    httpMock.expectNone((r) => r.url === '/api/commerce/orders');
  });

  it('creates an order, clears the cart, and navigates to /checkout/:id when checking out while authenticated', async () => {
    accessTokenStore.set('fake.jwt.token');
    cart.addItem(ITEM_A);
    fixture.detectChanges();

    findButtonByText('ดำเนินการชำระเงิน').click();
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/orders');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ courseIds: [ITEM_A.courseId], promoCode: undefined });
    req.flush(SAMPLE_ORDER);
    fixture.detectChanges();
    await macrotaskTick();

    expect(cart.items()).toEqual([]);
    expect(router.url).toBe('/checkout/order-1');
  });

  it('shows a translated checkout error, not the raw "common.error" i18n key, when order creation fails without a ProblemDetails body', () => {
    // Same regression class as the promo-code test above, for proceedToCheckout()'s error branch.
    // Uses a 500 (not 401) deliberately: error.interceptor.ts's silent-refresh-on-401 branch only
    // engages for an authenticated caller, which this test needs to be (proceedToCheckout() itself
    // redirects to /login before ever calling the API otherwise) — a 401 here would additionally
    // fire a real POST /api/identity/refresh this test has no reason to model.
    accessTokenStore.set('fake.jwt.token');
    cart.addItem(ITEM_A);
    fixture.detectChanges();

    findButtonByText('ดำเนินการชำระเงิน').click();
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/orders');
    req.flush(null, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('common.error');
    expect(text).toContain('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    // The cart must still hold its item — a failed checkout is not a successful one.
    expect(cart.items().length).toBe(1);
  });
});
