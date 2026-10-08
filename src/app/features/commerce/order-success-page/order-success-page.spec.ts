import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { OrderSuccessPage } from './order-success-page';

registerLocaleData(localeTh);

describe('OrderSuccessPage', () => {
  let fixture: ComponentFixture<OrderSuccessPage>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderSuccessPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          snapshot: { paramMap: convertToParamMap({ orderId: 'order-1' }), queryParamMap: convertToParamMap({}) },
        } },
      ],
    });
    fixture = TestBed.createComponent(OrderSuccessPage);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('does not render successful payment for an unpaid order', () => {
    httpMock.expectOne('/api/commerce/orders/order-1').flush({ id: 'order-1', status: 'Pending' });
    fixture.detectChanges();
    expect(router.navigate).toHaveBeenCalledWith(['/checkout', 'order-1'], { replaceUrl: true });
    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
    httpMock.expectNone((request) => request.url.includes('/enrollments/'));
  });

  it('shows an error when order verification fails without creating a fallback receipt', () => {
    httpMock.expectOne('/api/commerce/orders/order-1').flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
  });

  it('links a paid course using its owned enrollment slug', () => {
    httpMock.expectOne('/api/commerce/orders/order-1').flush({
      id: 'order-1', orderNo: 'ORDER-1', status: 'Paid', totalAmount: 0,
      items: [{ id: 'item-1', courseId: 'course-1', titleSnapshot: 'Owned course', lineTotal: 0 }],
    });
    httpMock.expectOne('/api/learning/enrollments/me?page=1&pageSize=50').flush({
      items: [{ courseId: 'course-1', courseSlug: 'owned-course' }], page: 1, pageSize: 50, totalCount: 1,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/learn/owned-course"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('ไม่มีค่าใช้จ่าย');
    httpMock.expectNone((request) => request.url.includes('/catalog/'));
  });
});

describe('OrderSuccessPage receipt download', () => {
  let fixture: ComponentFixture<OrderSuccessPage>;
  let httpMock: HttpTestingController;
  let toastError: ReturnType<typeof vi.spyOn>;
  let anchorClick: ReturnType<typeof vi.spyOn>;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  function receiptButton(): HTMLButtonElement {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('ดาวน์โหลดใบเสร็จรับเงิน'),
    ) as HTMLButtonElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderSuccessPage],
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          snapshot: { paramMap: convertToParamMap({ orderId: 'order-1' }), queryParamMap: convertToParamMap({}) },
        } },
      ],
    });
    TestBed.inject(TranslationService).setLocale('th');
    toastError = vi.spyOn(TestBed.inject(ToastService), 'error');
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => 'blob:receipt');
    URL.revokeObjectURL = vi.fn();

    fixture = TestBed.createComponent(OrderSuccessPage);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/commerce/orders/order-1').flush({
      id: 'order-1', orderNo: 'ORDER-1', status: 'Paid', totalAmount: 500,
      items: [{ id: 'item-1', courseId: 'course-1', titleSnapshot: 'Course', lineTotal: 500 }],
    });
    httpMock.expectOne('/api/learning/enrollments/me?page=1&pageSize=50').flush({ items: [], page: 1, pageSize: 50, totalCount: 0 });
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    anchorClick.mockRestore();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('downloads the server-rendered receipt PDF of the order', () => {
    receiptButton().click();
    const req = httpMock.expectOne('/api/commerce/orders/order-1/receipt');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('explains a missing seller setup (503 receipt.seller_not_configured) in plain words', async () => {
    receiptButton().click();
    httpMock.expectOne('/api/commerce/orders/order-1/receipt').flush(
      new Blob([JSON.stringify({ title: 'Receipt seller details are not configured.', status: 503, errorCode: 'receipt.seller_not_configured' })],
        { type: 'application/problem+json' }),
      { status: 503, statusText: 'Service Unavailable' },
    );
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    const message = toastError.mock.calls[0][0] as string;
    expect(message).toContain('ยังออกใบเสร็จไม่ได้ชั่วคราว');
    expect(message).not.toContain('not configured');
    expect(anchorClick).not.toHaveBeenCalled();

    // The same button is the retry: it is usable again once the failed attempt has finished.
    fixture.detectChanges();
    expect(receiptButton().disabled).toBe(false);
  });

  it('falls back to a generic message for any other failed download', async () => {
    receiptButton().click();
    httpMock.expectOne('/api/commerce/orders/order-1/receipt').flush(null, { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe('ไม่สามารถดาวน์โหลดใบเสร็จได้ กรุณาลองใหม่อีกครั้ง');
  });
});
