import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import {
  analyticsOverview,
  funnelReport,
  kycAgingReport,
  retentionReport,
  revenueReport,
  searchDemandReport,
  topTutorsReport,
} from '../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, controlByText, problemBody, settle, textOf, typeInto, useEnglish } from '../testing/spec-helpers';
import { AdminAnalyticsPage } from './admin-analytics-page';

@Component({ template: '' })
class RouteStub {}

const BASE = '/api/tutoring/admin/analytics';
const PAGE = '/admin/tutoring/analytics';

const BODIES: Readonly<Record<string, () => object>> = {
  revenue: revenueReport,
  'search-demand': searchDemandReport,
  retention: retentionReport,
  funnel: funnelReport,
  'top-tutors': topTutorsReport,
  'kyc-aging': kycAgingReport,
  overview: analyticsOverview,
};

describe('AdminAnalyticsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;

  beforeEach(async () => {
    // "Today" in Thailand is 14 October 2026, whatever day the suite runs.
    vi.setSystemTime(new Date('2026-10-14T05:00:00Z'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'admin/tutoring/analytics', component: AdminAnalyticsPage }, { path: '**', component: RouteStub }]), ...HTTP_TEST_PROVIDERS],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  function requests(path: string): TestRequest[] {
    return httpMock.match((r) => r.url === `${BASE}/${path}`);
  }

  /** Opens the page and answers the overview and the open report with fixtures; returns the report request that was made. */
  async function open(url: string, report: string | null = 'revenue'): Promise<TestRequest | null> {
    await harness.navigateByUrl(url, AdminAnalyticsPage);
    await settle(harness);
    requests('overview').forEach((req) => req.flush(BODIES['overview']()));
    let made: TestRequest | null = null;
    if (report !== null) {
      const [req] = requests(report);
      made = req ?? null;
      made?.flush(BODIES[report]());
    }
    await settle(harness);
    return made;
  }

  /** Lets the fire-and-forget `router.navigate` the page makes finish, then renders what the new address bar says. */
  async function afterNavigation(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await settle(harness);
  }

  function tabs(): HTMLButtonElement[] {
    return Array.from(root().querySelectorAll<HTMLButtonElement>('[role="group"] button[aria-pressed]'));
  }

  function pressedTab(): string | undefined {
    return tabs().find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent?.trim();
  }

  it('opens on the revenue report for the last 30 days, grouped by day, and shows the number tiles above it', async () => {
    const made = await open(PAGE);

    expect(made?.request.params.get('from')).toBe('2026-09-15');
    expect(made?.request.params.get('to')).toBe('2026-10-14');
    expect(made?.request.params.get('granularity')).toBe('Day');
    expect(root().querySelector('h1')?.textContent).toContain('Tutoring analytics');
    expect(textOf(root())).toContain('Cash in and out');
    expect(root().querySelectorAll('app-kpi-tile').length).toBeGreaterThanOrEqual(8);
  });

  it('offers the six reports as buttons, says which is open, and gives them a name for a screen reader', async () => {
    await open(PAGE);

    expect(tabs().map((button) => button.textContent?.trim())).toEqual(['Revenue', 'Search demand', 'Retention', 'Booking funnel', 'Top tutors', 'Identity checks']);
    expect(pressedTab()).toBe('Revenue');
    expect(root().querySelector('[role="group"][aria-label="Choose a report"]')).not.toBeNull();
    expect(tabs().every((button) => button.type === 'button')).toBe(true);
  });

  it('puts the open report in the address bar and reads that report when a tab is pressed', async () => {
    await open(PAGE);
    const router = TestBed.inject(Router);

    controlByText(root(), 'Search demand')?.click();
    await afterNavigation();
    const [search] = requests('search-demand');
    expect(router.url).toContain('tab=search');
    expect(search.request.params.get('top')).toBe('20');
    search.flush(searchDemandReport());
    await settle(harness);

    expect(pressedTab()).toBe('Search demand');
    expect(textOf(root())).toContain('What people search for');
    expect(requests('revenue')).toHaveLength(0);
  });

  it('takes the tab out of the address bar again for the default report', async () => {
    await open(`${PAGE}?tab=funnel`, 'funnel');
    const router = TestBed.inject(Router);

    controlByText(root(), 'Revenue')?.click();
    await afterNavigation();
    requests('revenue').forEach((req) => req.flush(revenueReport()));
    await settle(harness);

    expect(router.url).not.toContain('tab=');
    expect(pressedTab()).toBe('Revenue');
  });

  it('does nothing when the open tab is pressed again', async () => {
    await open(PAGE);

    controlByText(root(), 'Revenue')?.click();
    await settle(harness);

    expect(requests('revenue')).toHaveLength(0);
  });

  it('reads the period, the options and the report from the address bar, so a shared link lands on the same view', async () => {
    const made = await open(`${PAGE}?tab=funnel&from=2026-09-01&to=2026-09-30&segment=Paid`, 'funnel');

    expect(made?.request.params.get('from')).toBe('2026-09-01');
    expect(made?.request.params.get('to')).toBe('2026-09-30');
    expect(made?.request.params.get('segment')).toBe('Paid');
    expect(pressedTab()).toBe('Booking funnel');
    const fields = Array.from(root().querySelectorAll<HTMLInputElement>('input[type="date"]')).map((input) => input.value);
    expect(fields).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('reads top tutors with the ranking and the number of rows from the address bar', async () => {
    const made = await open(`${PAGE}?tab=tutors&sort=Rating&top=50`, 'top-tutors');

    expect(made?.request.params.get('sort')).toBe('Rating');
    expect(made?.request.params.get('top')).toBe('50');
  });

  it('reads retention by month, with the last 12 months as the default', async () => {
    const made = await open(`${PAGE}?tab=retention`, 'retention');

    expect(made?.request.params.get('fromMonth')).toBe('2025-11');
    expect(made?.request.params.get('toMonth')).toBe('2026-10');
  });

  it('reads the identity-check queue without a period, and shows only a note where the controls would be', async () => {
    const made = await open(`${PAGE}?tab=kyc`, 'kyc-aging');

    expect(made?.request.params.keys()).toEqual([]);
    expect(root().querySelector('form')).toBeNull();
    expect(textOf(root())).toContain('has no period to choose');
    expect(root().querySelector('[role="alert"]')).toBeNull();
  });

  it('never sends a hand-edited value it does not know: an unknown tab, step or ranking falls back', async () => {
    const made = await open(`${PAGE}?tab=%3Cscript%3E&granularity=Hour`, 'revenue');

    expect(made?.request.params.get('granularity')).toBe('Day');
    expect(pressedTab()).toBe('Revenue');
  });

  describe('a period the server would refuse is explained instead of being sent', () => {
    it('wrong order', async () => {
      await open(`${PAGE}?from=2026-10-10&to=2026-10-01`, null);

      expect(requests('revenue')).toHaveLength(0);
      expect(root().querySelectorAll('[role="alert"]')[0].textContent).toContain('The start must not be after the end.');
      expect(textOf(root())).not.toContain('Cash in and out');
    });

    it('ends in the future', async () => {
      await open(`${PAGE}?from=2026-10-10&to=2026-10-20`, null);

      expect(requests('revenue')).toHaveLength(0);
      expect(textOf(root())).toContain('The period cannot end after today.');
    });

    it('longer than the report allows - the limit is named', async () => {
      await open(`${PAGE}?from=2026-01-01&to=2026-10-14`, null);

      expect(requests('revenue')).toHaveLength(0);
      expect(textOf(root())).toContain('at most 92 days');
    });

    it('is checked for the open report only: the same period is fine for top tutors, which allows a year', async () => {
      const made = await open(`${PAGE}?tab=tutors&from=2025-12-01&to=2026-10-14`, 'top-tutors');

      expect(made).not.toBeNull();
      expect(root().querySelector('[role="alert"]')).toBeNull();
    });

    it('more than 24 months of retention', async () => {
      await open(`${PAGE}?tab=retention&fromMonth=2024-01&toMonth=2026-10`, null);

      expect(requests('retention')).toHaveLength(0);
      expect(textOf(root())).toContain('at most 24 months');
    });

    it('goes away, and the report is read, once the address bar holds a good period', async () => {
      await open(`${PAGE}?from=2026-10-10&to=2026-10-01`, null);

      await harness.navigateByUrl(`${PAGE}?from=2026-10-01&to=2026-10-10`, AdminAnalyticsPage);
      await settle(harness);
      const [req] = requests('revenue');
      req.flush(revenueReport());
      await settle(harness);

      expect(textOf(root())).toContain('Cash in and out');
      expect(textOf(root())).not.toContain('The start must not be after the end.');
    });
  });

  it('puts a period typed into the controls into the address bar and reads the report for it', async () => {
    await open(PAGE);
    const router = TestBed.inject(Router);
    const [from] = Array.from(root().querySelectorAll<HTMLInputElement>('input[type="date"]'));

    typeInto(from, '2026-10-01');
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await afterNavigation();

    const [req] = requests('revenue');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(router.url).toContain('from=2026-10-01');
    req.flush(revenueReport());
    await settle(harness);
  });

  it('reads the overview once, whatever tab is open, and keeps the report alive when the overview fails', async () => {
    await harness.navigateByUrl(PAGE, AdminAnalyticsPage);
    await settle(harness);
    requests('overview').forEach((req) => req.flush(problemBody(403, 'tutoring.forbidden', 'forbidden'), { status: 403, statusText: 'Forbidden' }));
    requests('revenue').forEach((req) => req.flush(revenueReport()));
    await settle(harness);

    expect(textOf(root())).toContain('Cash in and out');
    expect(textOf(root())).toContain('We could not load this report');

    controlByText(root(), 'Booking funnel')?.click();
    await afterNavigation();
    expect(requests('overview')).toHaveLength(0);
    requests('funnel').forEach((req) => req.flush(funnelReport()));
    await settle(harness);
  });

  it('shows each report its own failure without touching the others', async () => {
    await harness.navigateByUrl(PAGE, AdminAnalyticsPage);
    await settle(harness);
    requests('overview').forEach((req) => req.flush(analyticsOverview()));
    requests('revenue').forEach((req) => req.flush(problemBody(503, 'tutoring.analytics_timeout', 'unavailable'), { status: 503, statusText: 'Service Unavailable' }));
    await settle(harness);

    expect(root().querySelectorAll('app-kpi-tile').length).toBeGreaterThanOrEqual(8);
    expect(textOf(root())).toContain('We could not load this report');
  });

  it('carries the other administrator tutoring areas as links above the reports', async () => {
    await open(PAGE);

    const links = Array.from(root().querySelectorAll('app-admin-tutoring-nav a')).map((link) => link.getAttribute('href'));
    expect(links).toContain('/admin/tutoring/analytics');
    expect(links).toContain('/admin/tutoring/kyc');
  });
});
