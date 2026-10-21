import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AnalyticsGranularity } from '../../data/admin-analytics.models';
import { revenueBucket, revenueReport } from '../../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { RevenueReport as RevenueReportComponent } from './revenue-report';

const URL = '/api/tutoring/admin/analytics/revenue';

describe('RevenueReport', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    httpMock = TestBed.inject(HttpTestingController);
    useEnglish();
  });

  afterEach(() => httpMock.verify());

  async function mount(granularity: AnalyticsGranularity = 'Day'): Promise<ComponentFixture<RevenueReportComponent>> {
    const fixture = TestBed.createComponent(RevenueReportComponent);
    fixture.componentRef.setInput('from', '2026-10-12');
    fixture.componentRef.setInput('to', '2026-10-13');
    fixture.componentRef.setInput('granularity', granularity);
    await settle(fixture);
    return fixture;
  }

  async function answer(fixture: ComponentFixture<RevenueReportComponent>, body: object = revenueReport()): Promise<HTMLElement> {
    httpMock.expectOne((r) => r.url === URL).flush(body);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  function sectionOf(root: HTMLElement, headingId: string): HTMLElement {
    const heading = root.querySelector(`#${headingId}`);
    const section = heading?.closest('section');
    if (!section) {
      throw new Error(`no section for ${headingId}`);
    }
    return section;
  }

  it('asks for the period and the step it was given, and shows a skeleton until the server answers', async () => {
    const fixture = await mount('Week');

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('from')).toBe('2026-10-12');
    expect(req.request.params.get('to')).toBe('2026-10-13');
    expect(req.request.params.get('granularity')).toBe('Week');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')).not.toBeNull();
    req.flush(revenueReport({ granularity: 'Week' }));
  });

  it('shows the cash that moved and the revenue the ledger recognised as two separate cards with their own totals', async () => {
    const root = await answer(await mount());

    const cash = sectionOf(root, 'revenue-cash-heading');
    const ledger = sectionOf(root, 'revenue-ledger-heading');
    expect(textOf(cash)).toContain('Cash in and out');
    expect(textOf(cash)).toContain('฿2,700.00');
    expect(textOf(cash)).toContain('฿1,800.00');
    expect(textOf(cash)).toContain('฿900.00');
    expect(textOf(cash)).toContain('6 payments');
    expect(textOf(cash)).toContain('4 refunds');

    expect(textOf(ledger)).toContain('Revenue recognised in the ledger');
    expect(textOf(ledger)).toContain('฿2,250.00');
    expect(textOf(ledger)).toContain('฿90.00');
    expect(textOf(ledger)).toContain('฿432.00');
    expect(textOf(ledger)).toContain('฿1,728.00');
    expect(textOf(ledger)).toContain('5 ledger entries');
  });

  it('never mixes the two measurements: ledger figures stay out of the cash card and cash figures out of the ledger card', async () => {
    const root = await answer(await mount());

    const cash = textOf(sectionOf(root, 'revenue-cash-heading'));
    const ledger = textOf(sectionOf(root, 'revenue-ledger-heading'));
    expect(cash).not.toContain('฿2,250.00');
    expect(cash).not.toContain('฿432.00');
    expect(cash).not.toContain('฿1,728.00');
    expect(ledger).not.toContain('฿2,700.00');
    expect(ledger).not.toContain('฿1,800.00');
    expect(ledger).not.toContain('Collected minus refunded');
  });

  it('shows each total exactly as the server sent it - nothing is summed in the browser', async () => {
    const odd = revenueReport({
      totals: { ...revenueReport().totals, grossCollectedAmount: 123.45, netCollectedAmount: 7.77, platformCommissionAmount: 0.11 },
    });
    const root = await answer(await mount(), odd);

    expect(textOf(sectionOf(root, 'revenue-cash-heading'))).toContain('฿123.45');
    expect(textOf(sectionOf(root, 'revenue-cash-heading'))).toContain('฿7.77');
    expect(textOf(sectionOf(root, 'revenue-ledger-heading'))).toContain('฿0.11');
  });

  it('writes one row per period in each table, and shows a negative cash net with its minus sign (a refund of an earlier period)', async () => {
    const root = await answer(await mount());

    const [cashTable, ledgerTable] = Array.from(root.querySelectorAll('table'));
    expect(cashTable.querySelector('caption')?.textContent).toContain('Cash collected and refunded for each period');
    expect(ledgerTable.querySelector('caption')?.textContent).toContain('Revenue recognised in the ledger for each period');
    expect(cashTable.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(ledgerTable.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(textOf(cashTable.querySelectorAll('tbody tr')[0] as HTMLElement)).toContain('12 Oct 2026');
    expect(textOf(cashTable.querySelectorAll('tbody tr')[1] as HTMLElement)).toContain('-฿450.00');
  });

  it('puts the number beside every bar and keeps the bars out of the accessibility tree', async () => {
    const root = await answer(await mount());

    const cashRow = root.querySelector('table tbody tr') as HTMLElement;
    expect(textOf(cashRow)).toContain('฿1,350.00');
    expect(cashRow.querySelector('app-analytics-bar [aria-hidden="true"]')).not.toBeNull();
  });

  it('colours a negative net bar red and a normal one with the brand colour', async () => {
    const root = await answer(await mount());

    const rows = Array.from(root.querySelectorAll('table')[0].querySelectorAll('tbody tr'));
    expect(rows[0].querySelector('.tone-red')).toBeNull();
    expect(rows[1].querySelector('.tone-red')).not.toBeNull();
  });

  it('labels weekly rows by the week they start', async () => {
    const root = await answer(await mount('Week'), revenueReport({ granularity: 'Week' }));

    expect(textOf(root.querySelector('table tbody tr') as HTMLElement)).toContain('Week of 12 Oct 2026');
  });

  it('labels monthly rows by month', async () => {
    const root = await answer(
      await mount('Month'),
      revenueReport({ granularity: 'Month', buckets: [revenueBucket({ bucketStart: '2026-10-01' })] }),
    );

    expect(textOf(root.querySelector('table tbody tr') as HTMLElement)).toContain('October 2026');
  });

  it('warns loudly when the ledger and the payouts disagree', async () => {
    const root = await answer(await mount(), revenueReport({ ledgerMismatch: true }));

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Do not rely on these figures');
  });

  it('says nothing about a mismatch when there is none', async () => {
    const root = await answer(await mount());

    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('explains the notes the server attached, in words, and drops a note code it does not know', async () => {
    const root = await answer(await mount(), revenueReport({ notes: ['package_timing', 'fee_may_be_estimate', 'made_up_code'] }));

    expect(textOf(root)).toContain('Package money is collected when the package is bought');
    expect(textOf(root)).toContain('Recent payment fees can be estimates');
    expect(textOf(root)).not.toContain('made_up_code');
  });

  it('shows an empty state instead of empty tables when nothing happened in the period', async () => {
    const root = await answer(
      await mount(),
      revenueReport({ buckets: [], totals: { ...revenueReport().totals, paymentCount: 0, grossCollectedAmount: 0, netCollectedAmount: 0 } }),
    );

    expect(root.querySelectorAll('table')).toHaveLength(0);
    expect(textOf(root)).toContain('There is no revenue activity in this period.');
  });

  it('shows what went wrong in words and reads again on Try again', async () => {
    const fixture = await mount();
    httpMock.expectOne((r) => r.url === URL).flush(problemBody(503, 'tutoring.analytics_timeout', 'unavailable'), { status: 503, statusText: 'Service Unavailable' });
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;

    expect(textOf(root)).toContain('We could not load this report');
    expect(root.querySelector('table')).toBeNull();

    buttonByText(root, 'Try again')?.click();
    await settle(fixture);
    httpMock.expectOne((r) => r.url === URL).flush(revenueReport());
    await settle(fixture);
    expect(root.querySelector('table')).not.toBeNull();
  });

  it('does not leave the figures of the old period on screen when the period changes - a skeleton, then the new figures', async () => {
    const fixture = await mount();
    const root = await answer(fixture);

    fixture.componentRef.setInput('to', '2026-10-14');
    await settle(fixture);
    const next = httpMock.expectOne((r) => r.url === URL);
    expect(next.request.params.get('to')).toBe('2026-10-14');
    expect(root.querySelector('table')).toBeNull();
    expect(root.querySelector('[role="status"]')).not.toBeNull();
    next.flush(revenueReport({ totals: { ...revenueReport().totals, grossCollectedAmount: 4000 } }));
    await settle(fixture);
    expect(textOf(root)).toContain('฿4,000.00');
  });

  it('keeps the figures on screen while Refresh reads the same period again', async () => {
    const fixture = await mount();
    const root = await answer(fixture);

    buttonByText(root, 'Refresh')?.click();
    await settle(fixture);
    const again = httpMock.expectOne((r) => r.url === URL);
    expect(root.querySelector('table')).not.toBeNull();
    again.flush(revenueReport({ totals: { ...revenueReport().totals, grossCollectedAmount: 3100 } }));
    await settle(fixture);
    expect(textOf(root)).toContain('฿3,100.00');
  });
});
