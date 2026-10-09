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
import { PayoutBatchItem, PayoutPolicy, RevenueSplitItem, RevenueSplitStatus } from '../../payout/data/payout-api.models';

registerLocaleData(localeTh);

// Deliberately NOT the old hardcoded 70 / 3 / 500 / 14 so a stray literal can never pass as a server value.
const POLICY: PayoutPolicy = {
  revenueSharePercent: 80,
  platformSharePercent: 20,
  withholdingTaxPercent: 5,
  minimumPayoutAmount: 750,
  holdDays: 21,
};

const OLD_POLICY_LITERALS = ['70/30', 'Q4', 'Hold 14', 'หัก ณ ที่จ่าย 3%', '฿500', 'วันที่ 5', '1 และ 16'];
const RETRY_LABEL = 'โหลดตัวเลขเงื่อนไขไม่สำเร็จ — ลองใหม่';

const MOCK_BATCHES: PagedResponse<PayoutBatchItem> = {
  items: [
    {
      id: 'batch-1',
      periodKey: '2026-08',
      totalAmount: 125000,
      // `PayoutBatchStatus.Draft` — a freshly created batch; the backend has no "Pending" batch state.
      status: 'Draft',
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

  function flushPolicy(response: PayoutPolicy = POLICY, status = 200): void {
    const req = httpMock.expectOne('/api/payout/policy');
    expect(req.request.method).toBe('GET');
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush({ title: 'Server Error' }, { status, statusText: 'Error' });
    }
  }

  /** `policy: 'pending'` leaves the policy request open so a test can assert the loading state. */
  function flushInitialRequests(
    policy: 'ok' | 'error' | 'pending' = 'ok',
    overrides: { batches?: PagedResponse<PayoutBatchItem>; splits?: PagedResponse<RevenueSplitItem> } = {},
  ): void {
    if (policy === 'ok') {
      flushPolicy();
    } else if (policy === 'error') {
      flushPolicy(POLICY, 500);
    }

    const batchesReq = httpMock.expectOne((r) => r.url === '/api/payout/admin/batches');
    expect(batchesReq.request.method).toBe('GET');
    batchesReq.flush(overrides.batches ?? MOCK_BATCHES);

    const splitsReq = httpMock.expectOne((r) => r.url === '/api/payout/admin/revenue-splits');
    expect(splitsReq.request.method).toBe('GET');
    splitsReq.flush(
      overrides.splits ?? {
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
      },
    );

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
    expect(text).toContain('ฉบับร่าง (รอยืนยันจ่าย)');
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
      status: 'Draft',
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

  describe('status badges and filter (real backend enum values)', () => {
    const BATCHES_IN_EVERY_STATUS: PagedResponse<PayoutBatchItem> = {
      items: [
        { id: 'batch-draft', periodKey: '2026-07', totalAmount: 1000, status: 'Draft', createdAtUtc: '2026-07-31T00:00:00Z', items: [] },
        {
          id: 'batch-executed',
          periodKey: '2026-06',
          totalAmount: 2000,
          status: 'Executed',
          createdAtUtc: '2026-06-30T00:00:00Z',
          executedAtUtc: '2026-07-01T00:00:00Z',
          items: [],
        },
        { id: 'batch-failed', periodKey: '2026-05', totalAmount: 3000, status: 'Failed', createdAtUtc: '2026-05-31T00:00:00Z', items: [] },
      ],
      totalCount: 3,
      page: 1,
      pageSize: 50,
    };

    function splitIn(status: RevenueSplitStatus): RevenueSplitItem {
      return {
        id: `split-${status}`,
        orderItemId: `order-item-${status}`,
        instructorId: 'instructor-1',
        grossAmount: 1000,
        platformFeeAmount: 200,
        paymentFeeAmount: 30,
        instructorAmount: 770,
        status,
        createdAtUtc: '2026-08-10T00:00:00Z',
      };
    }

    const SPLITS_IN_EVERY_STATUS: PagedResponse<RevenueSplitItem> = {
      items: [splitIn('Pending'), splitIn('Payable'), splitIn('Paid'), splitIn('Reversed')],
      totalCount: 4,
      page: 1,
      pageSize: 50,
    };

    const BATCH_STATUS_COLUMN = 4;
    const BATCH_ACTIONS_COLUMN = 5;
    const SPLIT_STATUS_COLUMN = 6;

    function rowCells(column: number): HTMLTableCellElement[] {
      return Array.from(harness.routeNativeElement?.querySelectorAll('tbody tr') ?? []).map(
        (row) => row.querySelectorAll('td')[column],
      );
    }

    async function openSplitsTab(): Promise<void> {
      const tab = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('ส่วนแบ่งรายได้ (Revenue Splits)'),
      );
      expect(tab).toBeDefined();
      tab?.click();
      await settle();
    }

    function statusSelect(): HTMLSelectElement {
      const select = harness.routeNativeElement?.querySelector('#split-status-filter');
      expect(select).toBeInstanceOf(HTMLSelectElement);
      return select as HTMLSelectElement;
    }

    async function chooseStatusFilter(value: string): Promise<void> {
      const select = statusSelect();
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await settle();
    }

    function expectSplitsRequest(status: string | null): void {
      const req = httpMock.expectOne((r) => r.url === '/api/payout/admin/revenue-splits');
      expect(req.request.params.get('status')).toBe(status);
      req.flush(SPLITS_IN_EVERY_STATUS);
    }

    it('renders Draft / Executed / Failed batches with their own icon + label, never as "Paid" or "Processing"', async () => {
      await navigate();
      flushInitialRequests('ok', { batches: BATCHES_IN_EVERY_STATUS });
      await settle();

      const cells = rowCells(BATCH_STATUS_COLUMN);
      expect(cells.map((cell) => cell.textContent?.trim())).toEqual(['ฉบับร่าง (รอยืนยันจ่าย)', 'โอนเงินแล้ว', 'ดำเนินการไม่สำเร็จ']);
      for (const cell of cells) {
        expect(cell.querySelector('ng-icon'), 'a status badge needs an icon next to its text').not.toBeNull();
      }
    });

    it('offers "execute" only on a Draft batch (the backend answers 409 for any other batch status)', async () => {
      await navigate();
      flushInitialRequests('ok', { batches: BATCHES_IN_EVERY_STATUS });
      await settle();

      const hasExecuteButton = rowCells(BATCH_ACTIONS_COLUMN).map((cell) =>
        Array.from(cell.querySelectorAll('button')).some((b) => b.textContent?.includes('ยืนยันจ่ายเงิน')),
      );
      expect(hasExecuteButton).toEqual([true, false, false]);
    });

    it('executes a Draft batch via POST /batches/{id}/execute, then reloads and no longer offers execute', async () => {
      await navigate();
      flushInitialRequests('ok', { batches: BATCHES_IN_EVERY_STATUS });
      await settle();

      const executeBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('ยืนยันจ่ายเงิน'),
      );
      expect(executeBtn).toBeDefined();
      executeBtn?.click();
      await settle();

      const executeReq = httpMock.expectOne('/api/payout/admin/batches/batch-draft/execute');
      expect(executeReq.request.method).toBe('POST');
      executeReq.flush({ ...BATCHES_IN_EVERY_STATUS.items[0], status: 'Executed', executedAtUtc: '2026-08-01T00:00:00Z' });
      await settle();

      const reloadReq = httpMock.expectOne((r) => r.url === '/api/payout/admin/batches');
      reloadReq.flush({
        ...BATCHES_IN_EVERY_STATUS,
        items: [{ ...BATCHES_IN_EVERY_STATUS.items[0], status: 'Executed' }, ...BATCHES_IN_EVERY_STATUS.items.slice(1)],
      });
      await settle();

      expect(rowCells(BATCH_STATUS_COLUMN)[0].textContent?.trim()).toBe('โอนเงินแล้ว');
      expect(harness.routeNativeElement?.textContent).not.toContain('ยืนยันจ่ายเงิน');
    });

    it('renders Pending / Payable / Paid / Reversed splits with their own icon + label (no "Voided")', async () => {
      await navigate();
      flushInitialRequests('ok', { splits: SPLITS_IN_EVERY_STATUS });
      await settle();
      await openSplitsTab();

      const cells = rowCells(SPLIT_STATUS_COLUMN);
      expect(cells.map((cell) => cell.textContent?.trim())).toEqual([
        'รอเข้ารอบจ่ายเงิน',
        'พร้อมโอน (อยู่ในรอบจ่ายเงิน)',
        'โอนแล้ว',
        'ย้อนรายการ',
      ]);
      for (const cell of cells) {
        expect(cell.querySelector('ng-icon'), 'a status badge needs an icon next to its text').not.toBeNull();
      }
      expect(harness.routeNativeElement?.textContent).not.toContain('Voided');
    });

    it('lists exactly the backend RevenueSplitStatus members in the status filter (plus "All")', async () => {
      await navigate();
      flushInitialRequests();
      await settle();
      await openSplitsTab();

      const values = Array.from(statusSelect().options).map((option) => option.value);
      expect(values).toEqual(['All', 'Pending', 'Payable', 'Paid', 'Reversed']);
      expect(Array.from(statusSelect().options).map((option) => option.textContent?.trim())).toEqual([
        'ทั้งหมด',
        'รอเข้ารอบจ่ายเงิน',
        'พร้อมโอน (อยู่ในรอบจ่ายเงิน)',
        'โอนแล้ว',
        'ย้อนรายการ',
      ]);
    });

    it('sends ?status=<real enum value> when a status is picked and no status param for "All"', async () => {
      await navigate();
      flushInitialRequests();
      await settle();
      await openSplitsTab();

      await chooseStatusFilter('Payable');
      expectSplitsRequest('Payable');
      await settle();

      await chooseStatusFilter('Reversed');
      expectSplitsRequest('Reversed');
      await settle();

      await chooseStatusFilter('All');
      expectSplitsRequest(null);
      await settle();
    });
  });

  describe('revenue policy copy (GET /api/payout/policy)', () => {
    function openCreateBatchModal(): Promise<void> {
      const createBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('เปิดรอบจ่ายเงินใหม่'),
      );
      expect(createBtn).toBeDefined();
      createBtn?.click();
      return settle();
    }

    it('renders the server numbers in the header and the create-batch hint, with no invented policy literals', async () => {
      await navigate();
      flushInitialRequests();
      await settle();

      let text = harness.routeNativeElement?.textContent ?? '';
      expect(text).toContain('ผู้สอน 80% / แพลตฟอร์ม 20%');

      await openCreateBatchModal();

      text = harness.routeNativeElement?.textContent ?? '';
      expect(text).toContain('พ้นระยะ hold 21 วัน');
      expect(text).toContain('ภาษีหัก ณ ที่จ่าย 5%');
      expect(text).toContain('ยอดขั้นต่ำ ฿750.00');
      for (const literal of OLD_POLICY_LITERALS) {
        expect(text).not.toContain(literal);
      }
    });

    it('shows a skeleton and no policy number while the policy request is pending', async () => {
      await navigate();
      flushInitialRequests('pending');
      await settle();

      const root = harness.routeNativeElement as HTMLElement;
      let text = root.textContent ?? '';
      expect(text).not.toContain('80%');
      expect(text).not.toContain('แพลตฟอร์ม');
      expect(root.querySelector('app-payout-policy-text[aria-busy="true"]')).not.toBeNull();
      for (const literal of OLD_POLICY_LITERALS) {
        expect(text).not.toContain(literal);
      }

      flushPolicy();
      await settle();
      text = root.textContent ?? '';
      expect(text).toContain('ผู้สอน 80% / แพลตฟอร์ม 20%');
      expect(root.querySelector('app-payout-policy-text[aria-busy="true"]')).toBeNull();
    });

    it('shows "—" instead of any number when the policy request fails; retry refetches the real values', async () => {
      await navigate();
      flushInitialRequests('error');
      await settle();

      const root = harness.routeNativeElement as HTMLElement;
      let text = root.textContent ?? '';
      expect(text).toContain('ผู้สอน — / แพลตฟอร์ม —');
      expect(text).not.toContain('80%');
      for (const literal of OLD_POLICY_LITERALS) {
        expect(text).not.toContain(literal);
      }

      const retry = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === RETRY_LABEL);
      expect(retry).toBeDefined();
      retry?.click();
      await settle();
      flushPolicy();
      await settle();

      text = root.textContent ?? '';
      expect(text).toContain('ผู้สอน 80% / แพลตฟอร์ม 20%');
    });
  });
});
