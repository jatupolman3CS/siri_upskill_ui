import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PagedResult } from '../../../core/http/paged-result.model';
import { TranslationService } from '../../../core/i18n/translation.service';
import { OrderDetailResponse, TaxInvoiceResponse } from '../data/commerce-api.models';
import { OrderHistoryPage } from './order-history-page';

const MOCK_ORDERS: PagedResult<OrderDetailResponse> = {
  items: [
    {
      id: 'ord-001',
      orderNo: 'SU-260825-001',
      subtotalAmount: 1000,
      discountAmount: 200,
      taxAmount: 52.34,
      totalAmount: 800,
      currency: 'THB',
      status: 'Paid',
      createdAtUtc: '2026-08-25T10:00:00Z',
      paidAtUtc: '2026-08-25T10:05:00Z',
      items: [
        {
          id: 'item-001',
          courseId: 'course-001',
          titleSnapshot: 'Full-Stack Angular & .NET 10',
          unitPrice: 1000,
          lineTotal: 800,
        },
      ],
    },
    {
      id: 'ord-002',
      orderNo: 'SU-260825-002',
      subtotalAmount: 2000,
      discountAmount: 0,
      taxAmount: 130.84,
      totalAmount: 2000,
      currency: 'THB',
      status: 'AwaitingPayment',
      createdAtUtc: '2026-08-25T11:00:00Z',
      items: [
        {
          id: 'item-002',
          courseId: 'course-002',
          titleSnapshot: 'Cloud Architecture Masterclass',
          unitPrice: 2000,
          lineTotal: 2000,
        },
      ],
    },
    {
      id: 'ord-003',
      orderNo: 'SU-260825-003',
      subtotalAmount: 500,
      discountAmount: 0,
      taxAmount: 32.71,
      totalAmount: 500,
      currency: 'THB',
      status: 'Refunded',
      createdAtUtc: '2026-08-20T10:00:00Z',
      paidAtUtc: '2026-08-20T10:02:00Z',
      items: [
        {
          id: 'item-003',
          courseId: 'course-003',
          titleSnapshot: 'Introduction to TypeScript',
          unitPrice: 500,
          lineTotal: 500,
        },
      ],
    },
  ],
  totalCount: 3,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

describe('OrderHistoryPage', () => {
  let fixture: ComponentFixture<OrderHistoryPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderHistoryPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    fixture = TestBed.createComponent(OrderHistoryPage);
    httpMock = TestBed.inject(HttpTestingController);

    TestBed.inject(TranslationService).setLocale('en');
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/commerce/orders?page=1&pageSize=10');
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_ORDERS);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders order list with all items initially', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SU-260825-001');
    expect(text).toContain('SU-260825-002');
    expect(text).toContain('SU-260825-003');
    expect(text).toContain('Full-Stack Angular & .NET 10');
  });

  it('filters orders by paid status when Paid tab is selected', () => {
    const tabs = fixture.nativeElement.querySelectorAll('button[role="tab"]');
    const paidTab = Array.from(tabs).find((t) => (t as HTMLButtonElement).textContent?.includes('Paid')) as HTMLButtonElement;
    paidTab.click();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SU-260825-001');
    expect(text).not.toContain('SU-260825-002');
    expect(text).not.toContain('SU-260825-003');
  });

  it('filters orders by awaiting payment status', () => {
    const tabs = fixture.nativeElement.querySelectorAll('button[role="tab"]');
    const awaitingTab = Array.from(tabs).find((t) => (t as HTMLButtonElement).textContent?.includes('Awaiting Payment')) as HTMLButtonElement;
    awaitingTab.click();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('SU-260825-001');
    expect(text).toContain('SU-260825-002');
    expect(text).not.toContain('SU-260825-003');
  });

  it('filters orders by search query', () => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Cloud';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('SU-260825-001');
    expect(text).toContain('SU-260825-002');
  });

  it('toggles order detail expansion', () => {
    expect(fixture.nativeElement.textContent).not.toContain('VAT (7%)');

    const expandBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('View Details'),
    ) as HTMLButtonElement;

    expandBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('VAT (7%)');
    expect(fixture.nativeElement.textContent).toContain('Subtotal');
  });

  it('opens receipt modal and fetches tax invoice for paid order', () => {
    const receiptBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Print / Download Receipt'),
    ) as HTMLButtonElement;

    receiptBtn.click();
    fixture.detectChanges();

    const invoiceReq = httpMock.expectOne('/api/commerce/tax-invoices/by-order/ord-001');
    expect(invoiceReq.request.method).toBe('GET');

    const mockInvoice: TaxInvoiceResponse = {
      id: 'inv-001',
      orderId: 'ord-001',
      buyerName: 'John Doe',
      invoiceNo: 'INV-260825-ABC',
      issuedAtUtc: '2026-08-25T10:05:00Z',
      status: 'Issued',
    };
    invoiceReq.flush(mockInvoice);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('INV-260825-ABC');
    expect(fixture.nativeElement.textContent).toContain('John Doe');
  });

  it('submits refund request from refund modal', () => {
    const refundBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Request Refund'),
    ) as HTMLButtonElement;

    refundBtn.click();
    fixture.detectChanges();

    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Purchased wrong course by mistake';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submitBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Submit Request'),
    ) as HTMLButtonElement;

    submitBtn.click();
    fixture.detectChanges();

    const refundReq = httpMock.expectOne('/api/commerce/refunds');
    expect(refundReq.request.method).toBe('POST');
    expect(refundReq.request.body).toEqual({
      paymentId: 'ord-001',
      reason: 'Purchased wrong course by mistake',
    });

    refundReq.flush({
      id: 'ref-001',
      paymentId: 'ord-001',
      amount: 800,
      reason: 'Purchased wrong course by mistake',
      status: 'Pending',
      requestedAtUtc: '2026-08-25T12:00:00Z',
    });

    // Refresh orders call
    const refreshReq = httpMock.expectOne('/api/commerce/orders?page=1&pageSize=10');
    refreshReq.flush(MOCK_ORDERS);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Refund request submitted successfully');
  });
});
