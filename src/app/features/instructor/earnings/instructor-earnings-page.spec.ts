import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import {
  InstructorEarningsSummary,
  InstructorPayoutAccount,
  PayoutBatchItemStatus,
  PayoutPolicy,
  WithholdingTaxCertificate,
} from '../../payout/data/payout-api.models';
import { InstructorEarningsPage } from './instructor-earnings-page';

registerLocaleData(localeTh);

// Deliberately NOT the old hardcoded 70 / 3 / 500 / 14 so a stray literal can never pass as a server value.
const POLICY: PayoutPolicy = {
  revenueSharePercent: 80,
  platformSharePercent: 20,
  withholdingTaxPercent: 5,
  minimumPayoutAmount: 750,
  holdDays: 21,
};

const OLD_POLICY_LITERALS = ['วันที่ 5', '1 และ 16', 'สิ้นเดือน', 'ประจำเดือน', '70%', '70/30', 'Net 70'];

const EARNINGS_SUMMARY: InstructorEarningsSummary = {
  cumulativeEarnings: 52000,
  latestPayoutAmount: 12500,
  estimatedNextPayoutAmount: 9000,
  history: [
    {
      payoutId: 'payout-1',
      batchNumber: 'BATCH-2026-09-01',
      grossAmount: 17857,
      netAmount: 12500,
      withholdingTaxAmount: 536,
      periodEndUtc: '2026-08-31T23:59:59Z',
      // `PayoutBatchItemStatus.Transferred` — the backend never sends "Paid" for an instructor history row.
      status: 'Transferred',
      paidAtUtc: '2026-09-05T10:00:00Z',
    },
  ],
};

const EARNINGS_SUMMARY_WITH_MIXED_STATUSES: InstructorEarningsSummary = {
  cumulativeEarnings: 52000,
  latestPayoutAmount: 12500,
  estimatedNextPayoutAmount: 9000,
  history: [
    {
      payoutId: 'payout-1',
      batchNumber: 'BATCH-2026-09-01',
      grossAmount: 17857,
      netAmount: 12500,
      withholdingTaxAmount: 536,
      periodEndUtc: '2026-08-31T23:59:59Z',
      status: 'Transferred',
      paidAtUtc: '2026-09-05T10:00:00Z',
    },
    {
      payoutId: 'payout-2',
      batchNumber: 'BATCH-2026-08-01',
      grossAmount: 9000,
      netAmount: 6300,
      withholdingTaxAmount: 270,
      periodEndUtc: '2026-07-31T23:59:59Z',
      status: 'Pending',
      paidAtUtc: null,
    },
    {
      payoutId: 'payout-3',
      batchNumber: 'BATCH-2026-07-01',
      grossAmount: 5000,
      netAmount: 3500,
      withholdingTaxAmount: 150,
      periodEndUtc: '2026-06-30T23:59:59Z',
      status: 'Failed',
      paidAtUtc: null,
    },
  ],
};

const CERTIFICATE: WithholdingTaxCertificate = {
  batchItemId: 'payout-1',
  periodKey: '2026-08',
  issuedAtUtc: '2026-09-05T10:00:00Z',
  payerName: 'Siri Upskill Co., Ltd.',
  payerTaxId: '0105500000001',
  payerAddress: '1 Test Road, Bangkok',
  payeeName: 'Somchai Test',
  payeeTaxId: '1234567890123',
  taxPayerType: 'Individual',
  taxFormType: 'PND3',
  grossIncomeAmount: 17857,
  withholdingTaxPercent: 3,
  withholdingTaxAmount: 536,
  netIncomeAmount: 12500,
};

const EMPTY_EARNINGS_SUMMARY: InstructorEarningsSummary = {
  cumulativeEarnings: 0,
  latestPayoutAmount: 0,
  estimatedNextPayoutAmount: 0,
  history: [],
};

const PAYOUT_ACCOUNT: InstructorPayoutAccount = {
  id: 'account-1',
  instructorId: 'instructor-1',
  bankCode: 'KBANK',
  maskedAccountNo: '***-***-9999',
  accountName: 'Somchai Test',
  taxId: null,
  taxPayerType: 'Individual',
  verifiedAtUtc: '2026-09-20T03:00:00Z',
};

describe('InstructorEarningsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/earnings', component: InstructorEarningsPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
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

  async function navigate(): Promise<InstructorEarningsPage> {
    const component = await harness.navigateByUrl('/instructor/earnings', InstructorEarningsPage);
    await settle();
    return component;
  }

  async function flushEarnings(response: InstructorEarningsSummary = EARNINGS_SUMMARY, status = 200): Promise<void> {
    const req = httpMock.expectOne((r) => r.url === '/api/payout/instructor/earnings/summary');
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush({ title: 'Server Error' }, { status, statusText: 'Error' });
    }
    await settle();
  }

  async function flushAccount(response: InstructorPayoutAccount = PAYOUT_ACCOUNT, status = 200): Promise<void> {
    const req = httpMock.expectOne((r) => r.url === '/api/payout/instructor/payout-account' && r.method === 'GET');
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush({ title: 'Server Error' }, { status, statusText: 'Error' });
    }
    await settle();
  }

  async function flushPolicy(response: PayoutPolicy = POLICY, status = 200): Promise<void> {
    const req = httpMock.expectOne((r) => r.url === '/api/payout/policy');
    expect(req.request.method).toBe('GET');
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush({ title: 'Server Error' }, { status, statusText: 'Error' });
    }
    await settle();
  }

  function findButtonByText(text: string): HTMLButtonElement | undefined {
    return Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement | undefined;
  }

  it('shows loading skeletons and no fabricated figures before either request resolves', async () => {
    await navigate();
    await flushPolicy();

    expect(harness.routeNativeElement?.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
    const text = harness.routeNativeElement?.textContent ?? '';
    // The old hardcoded fake defaults — must never appear, not even transiently while loading.
    expect(text).not.toContain('148,500');
    expect(text).not.toContain('กสิกรไทย');
    expect(text).not.toContain('อานนท์ พัฒนากุล');
    expect(text).not.toContain('***-*-*8429-1');

    await flushEarnings();
    await flushAccount();
  });

  it('renders real earnings figures, bank account details, and history once both requests resolve', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings();
    await flushAccount();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Kasikornbank (KBANK)');
    expect(text).toContain('***-***-9999');
    expect(text).toContain('Somchai Test');
    expect(text).toContain('BATCH-2026-09-01');
    // The old fabricated fallback values — must never appear once real data is showing.
    expect(text).not.toContain('กสิกรไทย');
    expect(text).not.toContain('อานนท์ พัฒนากุล');
    expect(text).not.toContain('***-*-*8429-1');
  });

  it('shows a distinct status badge per payout row reflecting its real status, not a hardcoded "paid" label for every row', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings(EARNINGS_SUMMARY_WITH_MIXED_STATUSES);
    await flushAccount();

    const rows = harness.routeNativeElement?.querySelectorAll('tbody tr');
    expect(rows?.length).toBe(3);

    const [transferredRow, pendingRow, failedRow] = Array.from(rows ?? []);
    expect(transferredRow.textContent).toContain('Transferred');
    expect(transferredRow.textContent).not.toContain('Pending');
    expect(transferredRow.textContent).not.toContain('Failed');

    expect(pendingRow.textContent).toContain('Pending');
    expect(pendingRow.textContent).not.toContain('Transferred');
    expect(pendingRow.textContent).not.toContain('Failed');

    expect(failedRow.textContent).toContain('Failed');
    expect(failedRow.textContent).not.toContain('Transferred');
    expect(failedRow.textContent).not.toContain('Pending');
  });

  it('renders every real backend status as an icon + text badge (the meaning never rests on colour alone)', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings(EARNINGS_SUMMARY_WITH_MIXED_STATUSES);
    await flushAccount();

    // The status column is the 5th cell of each history row.
    const statusCells = Array.from(harness.routeNativeElement?.querySelectorAll('tbody tr') ?? []).map(
      (row) => row.querySelectorAll('td')[4],
    );
    expect(statusCells.map((cell) => cell?.textContent?.trim())).toEqual(['Transferred', 'Pending', 'Failed']);
    for (const cell of statusCells) {
      expect(cell?.querySelector('ng-icon'), 'a status badge needs an icon next to its text').not.toBeNull();
    }
  });

  it('shows the latest transfer date from a Transferred history item ("Paid on <date>")', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings(EARNINGS_SUMMARY);
    await flushAccount();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Paid on 05/09/2026');
    expect(text).not.toContain('No payout yet');
  });

  it('shows "No payout yet" when no history item is Transferred (Pending / Failed rows carry no transfer date)', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings({
      ...EARNINGS_SUMMARY_WITH_MIXED_STATUSES,
      latestPayoutAmount: 0,
      history: EARNINGS_SUMMARY_WITH_MIXED_STATUSES.history.filter((item) => item.status !== 'Transferred'),
    });
    await flushAccount();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('No payout yet');
    expect(text).not.toContain('Paid on');
  });

  it('does not treat a status the backend never sends ("Paid") as a completed transfer', async () => {
    await navigate();
    await flushPolicy();
    // Widened through `string`: "Paid" is deliberately NOT a PayoutBatchItemStatus — this is the old, wrong comparison value.
    const bogusStatus = 'Paid' as string as PayoutBatchItemStatus;
    await flushEarnings({
      ...EARNINGS_SUMMARY,
      history: EARNINGS_SUMMARY.history.map((item) => ({ ...item, status: bogusStatus })),
    });
    await flushAccount();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).not.toContain('Paid on');
    expect(text).toContain('No payout yet');
    const row = harness.routeNativeElement?.querySelector('tbody tr');
    expect(row?.textContent).not.toContain('Transferred');
    expect(row?.querySelectorAll('td')[4]?.textContent?.trim()).toBe('Paid');
  });

  it('shows an empty-history state (not fabricated rows) when the summary has no payout history yet', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings(EMPTY_EARNINGS_SUMMARY);
    await flushAccount();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('No payout history yet');
  });

  it('shows an error state (not fabricated numbers) when the earnings summary fetch fails; retry re-fetches real data', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings(EARNINGS_SUMMARY, 500);
    await flushAccount();

    let text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain("Couldn't load earnings data");
    expect(text).not.toContain('148,500');
    expect(text).not.toContain('BATCH-2026-09-01');

    const retryButton = findButtonByText('Try again');
    expect(retryButton).toBeTruthy();
    retryButton?.click();
    await settle();

    await flushEarnings();

    text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('BATCH-2026-09-01');
  });

  it('shows a bank-account error state (not fabricated bank info) when the payout-account fetch fails; retry re-fetches', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings();
    await flushAccount(PAYOUT_ACCOUNT, 500);

    let text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain("Couldn't load bank account details");
    expect(text).not.toContain('กสิกรไทย');
    expect(text).not.toContain('อานนท์');

    const retryButton = findButtonByText('Try again');
    expect(retryButton).toBeTruthy();
    retryButton?.click();
    await settle();

    await flushAccount();

    text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Kasikornbank (KBANK)');
    expect(text).toContain('Somchai Test');
  });

  it('treats a 404 from the payout-account GET as "no account yet" (an empty state with an add button), not as a load failure', async () => {
    await navigate();
    await flushPolicy();
    await flushEarnings();
    await flushAccount(PAYOUT_ACCOUNT, 404);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('No payout account yet');
    expect(text).not.toContain("Couldn't load bank account details");
    expect(findButtonByText('Add payout account')).toBeTruthy();
  });

  describe('revenue policy copy (GET /api/payout/policy)', () => {
    it('renders the server numbers in the header copy and the table headers (English)', async () => {
      await navigate();
      await flushPolicy();
      await flushEarnings();
      await flushAccount();

      const text = harness.routeNativeElement?.textContent ?? '';
      expect(text).toContain('Your revenue share is 80%');
      expect(text).toContain('hold period of 21 days');
      expect(text).toContain('reaches ฿750.00');
      expect(text).toContain('Withholding tax (5%)');
      expect(text).toContain('Net transfer (80% share)');
      // The server-config numbers that are NOT in play must not be shown either.
      expect(text).not.toContain('Withholding tax (3%)');
      for (const literal of OLD_POLICY_LITERALS) {
        expect(text).not.toContain(literal);
      }
    });

    it('renders the server numbers in Thai and states no payout date or cycle anywhere', async () => {
      TestBed.inject(TranslationService).setLocale('th');
      await navigate();
      await flushPolicy();
      await flushEarnings();
      await flushAccount();

      const text = harness.routeNativeElement?.textContent ?? '';
      expect(text).toContain('ส่วนแบ่งรายได้ 80% ให้กับผู้สอน');
      expect(text).toContain('ผู้ดูแลระบบจะสร้างรอบจ่ายหลังพ้นระยะ hold 21 วัน เมื่อยอดสะสมถึง ฿750.00');
      expect(text).toContain('ภาษี หัก ณ ที่จ่าย (5%)');
      expect(text).toContain('ยอดโอนสุทธิ (Net 80%)');
      for (const literal of OLD_POLICY_LITERALS) {
        expect(text).not.toContain(literal);
      }
    });

    it('shows a skeleton and "—" placeholders, never a number, while the policy is still loading', async () => {
      await navigate();
      // Earnings + account resolve, the policy request is deliberately left pending.
      await flushEarnings();
      await flushAccount();

      const root = harness.routeNativeElement as HTMLElement;
      const text = root.textContent ?? '';
      expect(text).not.toContain('80%');
      expect(text).not.toContain('Your revenue share is');
      expect(text).toContain('Withholding tax (—)');
      expect(text).toContain('Net transfer (— share)');
      expect(root.querySelector('app-payout-policy-text[aria-busy="true"]')).not.toBeNull();
      for (const literal of OLD_POLICY_LITERALS) {
        expect(text).not.toContain(literal);
      }

      await flushPolicy();
      expect(root.textContent).toContain('Your revenue share is 80%');
    });

    it('shows "—" instead of any number when the policy request fails, and a retry refetches the real values', async () => {
      await navigate();
      await flushPolicy(POLICY, 500);
      await flushEarnings();
      await flushAccount();

      const root = harness.routeNativeElement as HTMLElement;
      let text = root.textContent ?? '';
      expect(text).not.toContain('80%');
      expect(text).toContain('Withholding tax (—)');
      expect(text).toContain('Net transfer (— share)');
      for (const literal of OLD_POLICY_LITERALS) {
        expect(text).not.toContain(literal);
      }

      const retry = findButtonByText("Couldn't load the policy figures — try again");
      expect(retry).toBeTruthy();
      retry?.click();
      await settle();
      await flushPolicy();

      text = root.textContent ?? '';
      expect(text).toContain('Your revenue share is 80%');
      expect(text).toContain('Withholding tax (5%)');
      expect(findButtonByText("Couldn't load the policy figures — try again")).toBeUndefined();
    });
  });

  describe('withholding tax certificate (50 Tawi)', () => {
    function certificateButtons(): HTMLButtonElement[] {
      return Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).filter((b) =>
        b.getAttribute('aria-label')?.startsWith('View the withholding tax certificate'),
      ) as HTMLButtonElement[];
    }

    async function loadPage(summary: InstructorEarningsSummary): Promise<void> {
      await navigate();
      await flushPolicy();
      await flushEarnings(summary);
      await flushAccount();
    }

    it('offers the certificate only for transferred payouts and opens a dialog with the server figures', async () => {
      await loadPage(EARNINGS_SUMMARY_WITH_MIXED_STATUSES);
      const transferred = EARNINGS_SUMMARY_WITH_MIXED_STATUSES.history.filter((h) => h.status === 'Transferred').length;
      expect(certificateButtons().length).toBe(transferred);

      certificateButtons()[0].click();
      await settle();

      const req = httpMock.expectOne(`/api/payout/instructor/tax-certificates/${EARNINGS_SUMMARY_WITH_MIXED_STATUSES.history[0].payoutId}`);
      expect(req.request.method).toBe('GET');
      req.flush(CERTIFICATE);
      await settle();

      const dialog = harness.routeNativeElement?.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).not.toBeNull();
      const text = dialog.textContent ?? '';
      expect(text).toContain('Siri Upskill Co., Ltd.');
      expect(text).toContain('Somchai Test');
      expect(text).toContain('PND3');
    });

    it('explains how to fix an incomplete payout account when the server answers 409', async () => {
      await loadPage(EARNINGS_SUMMARY);
      certificateButtons()[0].click();
      await settle();

      httpMock
        .expectOne('/api/payout/instructor/tax-certificates/payout-1')
        .flush({ title: 'Conflict' }, { status: 409, statusText: 'Conflict' });
      await settle();

      const alert = harness.routeNativeElement?.querySelector('[role="dialog"] [role="alert"]') as HTMLElement;
      expect(alert).not.toBeNull();
      expect(alert.textContent).toContain('incomplete');
    });
  });
});
