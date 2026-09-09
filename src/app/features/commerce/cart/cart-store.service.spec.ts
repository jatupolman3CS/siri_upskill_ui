import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CartItem, CartStore } from './cart-store.service';

/** Matches `cart-store.service.ts`'s own private `STORAGE_KEY` constant — not exported, so this
 *  mirrors it rather than importing it, the same black-box style every other spec in this codebase
 *  uses for a service's persisted-state key. */
const STORAGE_KEY = 'siri_cart_items_v1';

/**
 * This test environment doesn't provide a real `localStorage` (Node logs
 * "localStorage is not available because --localstorage-file was not provided" and every
 * `localStorage.*` call throws) — same gap `consent-banner.spec.ts` already works around. Installs
 * a fresh in-memory fake before each test so `CartStore`'s real `loadFromStorage`/`saveToStorage`
 * code path (not a mock of it) is what's under test.
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

describe('CartStore', () => {
  let store: CartStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    accessTokenStore.set(null);
    installFakeLocalStorage();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    TestBed.inject(TranslationService).setLocale('th');
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(CartStore);
  });

  afterEach(() => {
    accessTokenStore.set(null);
    httpMock.verify();
  });

  it('starts empty when localStorage has no saved cart', () => {
    expect(store.items()).toEqual([]);
    expect(store.hasItems()).toBe(false);
    expect(store.itemCount()).toBe(0);
    expect(store.subtotal()).toBe(0);
    expect(store.total()).toBe(0);
  });

  it('adds an item, updating totals and persisting to localStorage', () => {
    const added = store.addItem(ITEM_A);

    expect(added).toBe(true);
    expect(store.items()).toEqual([ITEM_A]);
    expect(store.itemCount()).toBe(1);
    expect(store.hasItems()).toBe(true);
    expect(store.subtotal()).toBe(1890);
    expect(store.total()).toBe(1890);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toEqual([ITEM_A]);
  });

  it('refuses to add the same course twice', () => {
    store.addItem(ITEM_A);
    const addedAgain = store.addItem(ITEM_A);

    expect(addedAgain).toBe(false);
    expect(store.items().length).toBe(1);
  });

  it('removes an item, updating totals and localStorage', () => {
    store.addItem(ITEM_A);
    store.addItem(ITEM_B);

    store.removeItem(ITEM_A.courseId);

    expect(store.items()).toEqual([ITEM_B]);
    expect(store.itemCount()).toBe(1);
    expect(store.subtotal()).toBe(1990);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toEqual([ITEM_B]);
  });

  it('clears the cart, resetting items, promo state, and localStorage', () => {
    store.addItem(ITEM_A);
    store.addItem(ITEM_B);
    store.appliedPromo.set({
      isValid: true,
      code: 'SALE10',
      subtotal: 3880,
      discountAmount: 300,
      totalAmount: 3580,
    });
    store.promoError.set('some stale error');

    store.clearCart();

    expect(store.items()).toEqual([]);
    expect(store.appliedPromo()).toBeNull();
    expect(store.promoError()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
  });

  it('applies a valid promo code, updating discount and total', () => {
    store.addItem(ITEM_A);
    store.addItem(ITEM_B);

    let result: unknown;
    store.applyPromoCode('SALE10').subscribe((res) => (result = res));

    expect(store.isApplyingPromo()).toBe(true);

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      code: 'SALE10',
      courseIds: [ITEM_A.courseId, ITEM_B.courseId],
    });
    req.flush({
      isValid: true,
      code: 'SALE10',
      subtotal: 3880,
      discountAmount: 300,
      totalAmount: 3580,
    });

    expect(store.isApplyingPromo()).toBe(false);
    expect(store.appliedPromo()?.code).toBe('SALE10');
    expect(store.discount()).toBe(300);
    expect(store.total()).toBe(3580);
    expect(store.promoError()).toBeNull();
    expect(result).toBeTruthy();
  });

  it('uppercases and trims the promo code before sending it to the API', () => {
    store.addItem(ITEM_A);
    store.applyPromoCode('  sale10  ').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    expect(req.request.body.code).toBe('SALE10');
    req.flush({ isValid: true, code: 'SALE10', subtotal: 1890, discountAmount: 0, totalAmount: 1890 });
  });

  it('rejects an invalid promo code with the backend-provided error message', () => {
    store.addItem(ITEM_A);
    store.applyPromoCode('EXPIRED').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    req.flush({
      isValid: false,
      code: 'EXPIRED',
      subtotal: 1890,
      discountAmount: 0,
      totalAmount: 1890,
      errorMessage: 'รหัสส่วนลดหมดอายุแล้ว',
    });

    expect(store.appliedPromo()).toBeNull();
    expect(store.promoError()).toBe('รหัสส่วนลดหมดอายุแล้ว');
    expect(store.discount()).toBe(0);
  });

  it('falls back to a default Thai message when an invalid promo code has no errorMessage', () => {
    store.addItem(ITEM_A);
    store.applyPromoCode('EXPIRED').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    req.flush({ isValid: false, code: 'EXPIRED', subtotal: 1890, discountAmount: 0, totalAmount: 1890 });

    expect(store.promoError()).toBe('รหัสส่วนลดไม่ถูกต้องหรือไม่สามารถใช้ได้');
  });

  it('shows a translated error, not the raw "common.error" i18n key, when applying a promo code fails without a ProblemDetails body', () => {
    // Regression test matching checkout-page.spec.ts's equivalent test: error.interceptor.ts
    // deliberately falls back to the i18n KEY 'common.error' (not display text) when the response
    // carries no ProblemDetails body — e.g. a bare 401. `promoError` must resolve that key through
    // TranslationService before display, the same fix just applied to cart-store.service.ts's
    // `applyPromoCode` error branch.
    store.addItem(ITEM_A);
    store.applyPromoCode('SALE10').subscribe({ error: () => undefined });

    const req = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(store.promoError()).not.toBe('common.error');
    expect(store.promoError()).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    expect(store.isApplyingPromo()).toBe(false);
    expect(store.appliedPromo()).toBeNull();
  });

  it('removes an applied promo code without calling the API', () => {
    store.addItem(ITEM_A);
    store.applyPromoCode('SALE10').subscribe();
    httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate').flush({
      isValid: true,
      code: 'SALE10',
      subtotal: 1890,
      discountAmount: 300,
      totalAmount: 1590,
    });

    store.removePromoCode();

    expect(store.appliedPromo()).toBeNull();
    expect(store.promoError()).toBeNull();
    expect(store.discount()).toBe(0);
    expect(store.total()).toBe(1890);
    // httpMock.verify() in afterEach proves removePromoCode() made no further request.
  });

  it('revalidates an applied promo code against the smaller course list when an item is removed', () => {
    store.addItem(ITEM_A);
    store.addItem(ITEM_B);
    store.applyPromoCode('SALE10').subscribe();
    httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate').flush({
      isValid: true,
      code: 'SALE10',
      subtotal: 3880,
      discountAmount: 300,
      totalAmount: 3580,
    });

    store.removeItem(ITEM_B.courseId);

    const revalidateReq = httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate');
    expect(revalidateReq.request.body).toEqual({ code: 'SALE10', courseIds: [ITEM_A.courseId] });
    revalidateReq.flush({
      isValid: true,
      code: 'SALE10',
      subtotal: 1890,
      discountAmount: 100,
      totalAmount: 1790,
    });

    expect(store.discount()).toBe(100);
  });

  it('clears the applied promo code (without calling the API) once the last item is removed', () => {
    store.addItem(ITEM_A);
    store.applyPromoCode('SALE10').subscribe();
    httpMock.expectOne((r) => r.url === '/api/commerce/promo-codes/validate').flush({
      isValid: true,
      code: 'SALE10',
      subtotal: 1890,
      discountAmount: 300,
      totalAmount: 1590,
    });

    store.removeItem(ITEM_A.courseId);

    expect(store.items()).toEqual([]);
    expect(store.appliedPromo()).toBeNull();
    // httpMock.verify() in afterEach proves no revalidation request was made against an empty cart.
  });
});

describe('CartStore — loading persisted state', () => {
  it('loads previously saved items from localStorage on construction', () => {
    installFakeLocalStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([ITEM_A]));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    const store = TestBed.inject(CartStore);

    expect(store.items()).toEqual([ITEM_A]);
    expect(store.subtotal()).toBe(1890);
  });

  it('starts empty (instead of throwing) when localStorage contains malformed JSON', () => {
    installFakeLocalStorage();
    localStorage.setItem(STORAGE_KEY, '{not valid json');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    const store = TestBed.inject(CartStore);

    expect(store.items()).toEqual([]);
  });
});
