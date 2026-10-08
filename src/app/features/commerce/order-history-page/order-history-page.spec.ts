import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../core/http/error.interceptor';
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
      paymentId: 'pay-001',
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
    // The payment id, never the order id (`ord-001`) — the API's `paymentId` field is a Payments row.
    expect(refundReq.request.body).toEqual({
      paymentId: 'pay-001',
      amount: 800,
      reason: 'Purchased wrong course by mistake',
    });

    refundReq.flush({
      id: 'ref-001',
      paymentId: 'pay-001',
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

describe('OrderHistoryPage refund blocked by live attendance (409 refund.live_attended)', () => {
  let fixture: ComponentFixture<OrderHistoryPage>;
  let httpMock: HttpTestingController;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(text: string): HTMLButtonElement | undefined {
    return Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  }

  /** Opens the refund modal for the paid order and submits a reason; returns the refund request. */
  function submitRefund() {
    button('Request Refund')?.click();
    fixture.detectChanges();
    const textarea = root().querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Not what I expected';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Submit Request')?.click();
    fixture.detectChanges();
    return httpMock.expectOne('/api/commerce/refunds');
  }

  function refuse(req: ReturnType<typeof submitRefund>, details: Record<string, unknown>): void {
    req.flush(
      { status: 409, errorCode: 'conflict', reason: 'refund.live_attended', title: 'Conflict', ...details },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderHistoryPage],
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(OrderHistoryPage);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(TranslationService).setLocale('en');
    fixture.detectChanges();
    httpMock.expectOne('/api/commerce/orders?page=1&pageSize=10').flush(MOCK_ORDERS);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('explains the refusal, lists the blocked courses and offers the maximum the server reported', () => {
    refuse(submitRefund(), { blockedCourseTitles: ['Full-Stack Angular & .NET 10'], maxRefundableAmount: 300, blockedAmount: 500 });

    const alert = root().querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain("You've joined a live session of a course in this order");
    expect(alert.textContent).toContain('Full-Stack Angular & .NET 10');
    expect(alert.textContent).toContain('Maximum refundable amount');
    expect(alert.textContent).toContain('300');
    expect(button('Request the maximum refund')).toBeDefined();
    // The generic error message must not also appear.
    expect(root().textContent).not.toContain('Unable to submit refund request');
  });

  it('requests exactly the server-reported maximum when that button is pressed', () => {
    refuse(submitRefund(), { blockedCourseTitles: ['Full-Stack Angular & .NET 10'], maxRefundableAmount: 300, blockedAmount: 500 });

    button('Request the maximum refund')?.click();
    fixture.detectChanges();
    const retry = httpMock.expectOne('/api/commerce/refunds');
    expect(retry.request.body).toEqual({ paymentId: 'pay-001', amount: 300, reason: 'Not what I expected' });
    retry.flush({
      id: 'ref-002', paymentId: 'pay-001', amount: 300, reason: 'Not what I expected',
      status: 'Pending', requestedAtUtc: '2026-08-25T12:00:00Z',
    });
    httpMock.expectOne('/api/commerce/orders?page=1&pageSize=10').flush(MOCK_ORDERS);
    fixture.detectChanges();
    expect(root().textContent).toContain('Refund request submitted successfully');
  });

  it('offers no retry when nothing at all is refundable', () => {
    refuse(submitRefund(), { blockedCourseTitles: ['Full-Stack Angular & .NET 10'], maxRefundableAmount: 0, blockedAmount: 800 });
    expect(root().querySelector('[role="alert"]')?.textContent).toContain("You've joined a live session");
    expect(button('Request the maximum refund')).toBeUndefined();
  });

  it('keeps the generic error for any other failed refund', () => {
    const req = submitRefund();
    req.flush({ status: 400, title: 'Bad' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(root().querySelector('[role="alert"]')).toBeNull();
    expect(root().textContent).toContain('Unable to submit refund request');
  });

  it('clears the notice when the modal is closed and reopened', () => {
    refuse(submitRefund(), { blockedCourseTitles: [], maxRefundableAmount: 300, blockedAmount: 500 });
    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    // The modal's own Cancel button (the order cards have unrelated buttons with similar labels).
    const modal = (root().querySelector('textarea') as HTMLTextAreaElement).closest('app-modal') as HTMLElement;
    Array.from(modal.querySelectorAll('button')).find((b) => b.textContent?.includes('Cancel'))?.click();
    fixture.detectChanges();
    button('Request Refund')?.click();
    fixture.detectChanges();
    expect(root().querySelector('[role="alert"]')).toBeNull();
  });
});

describe('OrderHistoryPage paid order without a succeeded payment (paymentId null)', () => {
  let fixture: ComponentFixture<OrderHistoryPage>;
  let httpMock: HttpTestingController;

  const FREE_ORDER: PagedResult<OrderDetailResponse> = {
    items: [
      {
        id: 'ord-free',
        orderNo: 'SU-260825-100',
        subtotalAmount: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        currency: 'THB',
        status: 'Paid',
        createdAtUtc: '2026-08-25T10:00:00Z',
        paidAtUtc: '2026-08-25T10:00:00Z',
        paymentId: null,
        items: [{ id: 'item-free', courseId: 'course-free', titleSnapshot: 'Free intro course', unitPrice: 0, lineTotal: 0 }],
      },
    ],
    totalCount: 1,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderHistoryPage],
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(OrderHistoryPage);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(TranslationService).setLocale('en');
    fixture.detectChanges();
    httpMock.expectOne('/api/commerce/orders?page=1&pageSize=10').flush(FREE_ORDER);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('hides the refund action and says why instead', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('SU-260825-100');
    expect(text).not.toContain('Request Refund');
    expect(text).toContain('No payment to refund on this order');
  });

  it('never sends a refund request even if the modal is driven programmatically', () => {
    const page = fixture.componentInstance as unknown as {
      openRefundModal(order: OrderDetailResponse): void;
      refundReason: { set(value: string): void };
      submitRefund(): void;
    };
    page.openRefundModal(FREE_ORDER.items[0]);
    page.refundReason.set('Because');
    page.submitRefund();
    httpMock.expectNone('/api/commerce/refunds');
  });
});

describe('OrderHistoryPage document title', () => {
  it('sets the translated title and description, never the raw i18n keys', () => {
    TestBed.configureTestingModule({
      imports: [OrderHistoryPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(TranslationService).setLocale('en');
    const httpMock = TestBed.inject(HttpTestingController);

    TestBed.createComponent(OrderHistoryPage).detectChanges();
    httpMock.expectOne('/api/commerce/orders?page=1&pageSize=10').flush({ items: [], totalCount: 0, page: 1, pageSize: 10 });

    expect(TestBed.inject(Title).getTitle()).toBe('Order History | SIRI UpSkill');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'View your order history, receipts, and payment statuses.',
    );
    httpMock.verify();
  });
});
