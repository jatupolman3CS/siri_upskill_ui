import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
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
