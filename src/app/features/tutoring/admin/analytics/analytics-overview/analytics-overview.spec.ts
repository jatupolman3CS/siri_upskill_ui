import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { analyticsOverview } from '../../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { AnalyticsOverviewPanel } from './analytics-overview';

const URL = '/api/tutoring/admin/analytics/overview';

describe('AnalyticsOverviewPanel', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS, provideRouter([])] });
    httpMock = TestBed.inject(HttpTestingController);
    useEnglish();
  });

  afterEach(() => httpMock.verify());

  async function mount(): Promise<ComponentFixture<AnalyticsOverviewPanel>> {
    const fixture = TestBed.createComponent(AnalyticsOverviewPanel);
    await settle(fixture);
    return fixture;
  }

  async function answer(fixture: ComponentFixture<AnalyticsOverviewPanel>, body: object = analyticsOverview()): Promise<HTMLElement> {
    httpMock.expectOne(URL).flush(body);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  function tiles(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('app-kpi-tile')).map((tile) => textOf(tile as HTMLElement));
  }

  it('shows a skeleton until the server answers', async () => {
    const fixture = await mount();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')).not.toBeNull();
    httpMock.expectOne(URL).flush(analyticsOverview());
    await settle(fixture);
  });

  it('shows the money of the last 30 days as the server gave it', async () => {
    const root = await answer(await mount());

    const [cash, commission, completed] = tiles(root);
    expect(cash).toContain('Cash collected, after refunds');
    expect(cash).toContain('฿12,500.00');
    expect(commission).toContain('Platform commission recognised');
    expect(commission).toContain('฿2,400.00');
    expect(completed).toContain('Lessons completed');
    expect(completed).toContain('52');
    expect(cash).toContain('Last 30 days');
  });

  it('shows the two rates as percentages with what they are out of', async () => {
    const root = await answer(await mount());

    const [, , , hold, completion] = tiles(root);
    expect(hold).toContain('72.9%');
    expect(hold).toContain('Of held bookings whose time to pay is over');
    expect(completion).toContain('83.3%');
  });

  it('shows a rate the server could not give as a dash with the reason - never 0%', async () => {
    const root = await answer(
      await mount(),
      analyticsOverview({ last30Days: { ...analyticsOverview().last30Days, holdConversionRate: null, completionRate: null } }),
    );

    const [, , , hold, completion] = tiles(root);
    expect(hold).toContain('-');
    expect(hold).toContain('Not enough data');
    expect(hold).not.toContain('%');
    expect(completion).toContain('Not enough data');
  });

  it('names the month of the newest retention figure that is old enough to mean something', async () => {
    const root = await answer(await mount());

    const retention = tiles(root)[5];
    expect(retention).toContain('Learners who rebook within 60 days');
    expect(retention).toContain('60%');
    expect(retention).toContain('Learners whose first lesson was in August 2026');
  });

  it('shows a dash and "not enough data" when no cohort is old enough yet', async () => {
    const root = await answer(await mount(), analyticsOverview({ latestMatureRetention: null }));

    const retention = tiles(root)[5];
    expect(retention).toContain('-');
    expect(retention).toContain('Not enough data');
  });

  it('shows the identity checks waiting and how long the oldest has waited', async () => {
    const root = await answer(await mount());

    const kyc = tiles(root)[6];
    expect(kyc).toContain('Identity checks waiting for us');
    expect(kyc).toContain('5');
    expect(kyc).toContain('Oldest has waited 96 h');
  });

  it('leaves the "oldest" line out when nothing is waiting', async () => {
    const root = await answer(await mount(), analyticsOverview({ kycAwaitingAdmin: 0, kycOldestAgeHours: null }));

    const kyc = tiles(root)[6];
    expect(kyc).toContain('0');
    expect(kyc).not.toContain('Oldest has waited');
  });

  it('shows the open disputes with how many are overdue and urgent', async () => {
    const root = await answer(await mount());

    const disputes = tiles(root)[7];
    expect(disputes).toContain('Open disputes');
    expect(disputes).toContain('3');
    expect(disputes).toContain('1 overdue, 2 high priority');
  });

  it('names the most searched subject as plain text, or says nothing when there is none', async () => {
    const withSubject = await answer(await mount());
    expect(textOf(withSubject)).toContain('Most searched subject: Physics (TH) (120 searches).');
  });

  it('says nothing about a most searched subject when the server named none', async () => {
    const root = await answer(await mount(), analyticsOverview({ topSearchedSubject: null }));

    expect(textOf(root)).not.toContain('Most searched subject');
  });

  it('links to the queues it counts, and nowhere else', async () => {
    const root = await answer(await mount());

    const links = Array.from(root.querySelectorAll('a')).map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/admin/tutoring/kyc', '/admin/tutoring/disputes']);
  });

  it('reports a failure in words and offers a retry that reads again', async () => {
    const fixture = await mount();
    httpMock.expectOne(URL).flush(problemBody(403, 'tutoring.forbidden', 'forbidden'), { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;

    expect(textOf(root)).toContain('We could not load this report');
    expect(root.querySelector('app-kpi-tile')).toBeNull();
  });
});
