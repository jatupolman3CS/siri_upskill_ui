import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PagedPendingRefunds } from './data/admin-refunds-api.models';
import { AdminPayoutsPage } from './admin-payouts-page';
import { PagedResponse } from '../../payout/data/payout-api.service';
import { PayoutBatchItem } from '../../payout/data/payout-api.models';

registerLocaleData(localeTh);

const MOCK_BATCHES: PagedResponse<PayoutBatchItem> = {
  items: [
    {
      id: 'batch-1',
      periodKey: '2026-08',
      totalAmount: 125000,
      status: 'Pending',
      createdAtUtc: '2026-08-20T00:00:00Z',
      items: [],
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
};

const MOCK_REFUNDS: PagedPendingRefunds = {
  items: [
    {
      id: 'ref-1',
      paymentId: 'pay-1',
      amount: 1890,
      reason: 'Purchased by mistake',
      status: 'Requested',
      requestedAtUtc: '2026-08-25T10:00:00Z',
      decidedAtUtc: null,
      decisionNote: null,
      completedAtUtc: null,
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

describe('AdminPayoutsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // AdminPayoutsPage's ngOnInit derives the default new-batch period key from the
    // real wall clock — freeze Date only (not setTimeout/etc., which the router harness
    // relies on) so that derived value is deterministic regardless of when tests run.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-15T00:00:00Z'));

    TestBed.configureTestingModule({
      providers: [
        CurrencyPipe,
        provideRouter([{ path: 'admin/payouts', component: AdminPayoutsPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function navigate(): Promise<AdminPayoutsPage> {
    const component = await harness.navigateByUrl('/admin/payouts', AdminPayoutsPage);
    await settle();
    return component;
  }

  function flushInitialRequests(): void {
    const batchesReq = httpMock.expectOne((r) => r.url === '/api/payout/admin/batches');
    expect(batchesReq.request.method).toBe('GET');
    batchesReq.flush(MOCK_BATCHES);

    const splitsReq = httpMock.expectOne((r) => r.url === '/api/payout/admin/revenue-splits');
    expect(splitsReq.request.method).toBe('GET');
    splitsReq.flush({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 50,
    });

    const refundsReq = httpMock.expectOne((r) => r.url === '/api/commerce/admin/refunds/pending');
    expect(refundsReq.request.method).toBe('GET');
    refundsReq.flush(MOCK_REFUNDS);
  }

  it('renders payout batches list from API', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('รอบจ่ายเงิน & คิวคำขอคืนเงิน');
    expect(text).toContain('2026-08');
    expect(text).toContain('125,000');
    expect(text).toContain('รอดำเนินการ');
  });

  it('switches to refunds tab and approves pending refund', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    // Switch to Refunds tab
    const buttons = harness.routeNativeElement?.querySelectorAll('button') ?? [];
    const refundTabBtn = Array.from(buttons).find((b) => b.textContent?.includes('คำขอคืนเงินรออนุมัติ'));
    expect(refundTabBtn).toBeDefined();
    refundTabBtn?.click();
    await settle();

    let text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Purchased by mistake');
    expect(text).toContain('1,890');

    // Click Approve button
    const approveBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('อนุมัติคืนเงิน')
    );
    expect(approveBtn).toBeDefined();
    approveBtn?.click();
    await settle();

    // In modal, click confirm approve
    const modalApproveBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('อนุมัติคืนเงินทันที')
    );
    expect(modalApproveBtn).toBeDefined();
    modalApproveBtn?.click();
    await settle();

    const approveReq = httpMock.expectOne('/api/commerce/admin/refunds/ref-1/approve');
    expect(approveReq.request.method).toBe('POST');
    approveReq.flush({
      id: 'ref-1',
      paymentId: 'pay-1',
      amount: 1890,
      reason: 'Purchased by mistake',
      status: 'Approved',
      requestedAtUtc: '2026-08-25T10:00:00Z',
      decidedAtUtc: new Date().toISOString(),
      decisionNote: null,
      completedAtUtc: null,
    });
    await settle();

    // Reloads pending refunds
    const reloadReq = httpMock.expectOne((r) => r.url === '/api/commerce/admin/refunds/pending');
    reloadReq.flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
    await settle();

    text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('อนุมัติคำขอคืนเงินจำนวน ฿1,890 เรียบร้อยแล้ว');
  });

  it('creates a new payout batch and updates list', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    // Open create batch modal
    const createBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('เปิดรอบจ่ายเงินใหม่')
    );
    expect(createBtn).toBeDefined();
    createBtn?.click();
    await settle();

    // Submit form
    const form = harness.routeNativeElement?.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await settle();

    const postReq = httpMock.expectOne('/api/payout/admin/batches');
    expect(postReq.request.method).toBe('POST');
    postReq.flush({
      id: 'batch-2',
      periodKey: '2026-08',
      totalAmount: 50000,
      status: 'Pending',
      createdAtUtc: new Date().toISOString(),
      items: [],
    });
    await settle();

    // Reloads batches
    const reloadReq = httpMock.expectOne((r) => r.url === '/api/payout/admin/batches');
    reloadReq.flush(MOCK_BATCHES);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('สร้างรอบการจ่ายเงินงวด 2026-08 เรียบร้อยแล้ว');
  });
});
