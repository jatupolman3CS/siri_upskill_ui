import '@angular/compiler';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AdminPaymentsPage } from './admin-payments-page';
import { PagedAdminRefunds, PagedPaymentOps } from './data/admin-payments-api.models';

registerLocaleData(localeTh);

const MOCK_OPS_ENTRIES: PagedPaymentOps = {
  items: [
    {
      id: 'ops-1',
      paymentId: 'pay-1',
      reason: 'Late payment after cancellation',
      status: 'Open',
      assignedToUserId: null,
      resolvedByUserId: null,
      resolvedAtUtc: null,
      note: null,
      orderId: 'ord-1',
      orderNo: 'ORD-TEST-001',
      userId: 'user-1',
      userEmail: 'student@example.test',
      amount: 1500,
      paymentMethod: 'PromptPay',
      paymentStatus: 'Succeeded',
      orderStatus: 'Cancelled',
      providerPaymentIntentId: 'pi_test_123',
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const MOCK_REFUNDS: PagedAdminRefunds = {
  items: [
    {
      id: 'ref-1',
      paymentId: 'pay-1',
      amount: 1500,
      reason: 'Course content mismatch',
      status: 'Pending',
      requestedAtUtc: '2026-08-27T10:00:00Z',
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

describe('AdminPaymentsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        CurrencyPipe,
        provideRouter([{ path: 'admin/payments', component: AdminPaymentsPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function navigate(): Promise<AdminPaymentsPage> {
    const component = await harness.navigateByUrl('/admin/payments', AdminPaymentsPage);
    await settle();
    return component;
  }

  function flushInitialRequests(): void {
    const opsReq = httpMock.expectOne((r) => r.url.startsWith('/api/commerce/admin/payment-ops'));
    expect(opsReq.request.method).toBe('GET');
    opsReq.flush(MOCK_OPS_ENTRIES);

    const refundsReq = httpMock.expectOne((r) => r.url.startsWith('/api/commerce/admin/refunds/pending'));
    expect(refundsReq.request.method).toBe('GET');
    refundsReq.flush(MOCK_REFUNDS);
  }

  it('renders Ops Queue entries and KPIs properly', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('การจัดการชำระเงิน & Ops Queue');
    expect(text).toContain('ORD-TEST-001');
    expect(text).toContain('Late payment after cancellation');
    expect(text).toContain('student@example.test');
  });

  it('assigns open queue entry to admin', async () => {
    const component = await navigate();
    flushInitialRequests();
    await settle();

    component.assignToSelf(MOCK_OPS_ENTRIES.items[0]);
    await settle();

    const assignReq = httpMock.expectOne('/api/commerce/admin/payment-ops/ops-1/assign');
    expect(assignReq.request.method).toBe('POST');
    assignReq.flush({
      ...MOCK_OPS_ENTRIES.items[0],
      status: 'InProgress',
      assignedToUserId: 'admin-1',
    });
    await settle();

    // Reload triggers
    flushInitialRequests();
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('มอบหมายรายการ ORD-TEST-001 ให้คุณเรียบร้อยแล้ว');
  });

  it('opens resolve modal and resolves queue entry', async () => {
    const component = await navigate();
    flushInitialRequests();
    await settle();

    component.openResolveModal(MOCK_OPS_ENTRIES.items[0]);
    await settle();

    const modalTitle = harness.routeNativeElement?.querySelector('h3')?.textContent ?? '';
    expect(modalTitle).toContain('ดำเนินการแก้ไขเคสการชำระเงิน');

    component.submitResolve();
    await settle();

    const resolveReq = httpMock.expectOne('/api/commerce/admin/payment-ops/ops-1/resolve');
    expect(resolveReq.request.method).toBe('POST');
    resolveReq.flush({
      ...MOCK_OPS_ENTRIES.items[0],
      status: 'Resolved',
    });
    await settle();

    // Reload triggers
    flushInitialRequests();
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('ดำเนินการแก้ไขรายการ ORD-TEST-001 สำเร็จ');
  });
});
