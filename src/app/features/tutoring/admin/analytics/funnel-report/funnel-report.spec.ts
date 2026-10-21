import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { FunnelSegment } from '../../data/admin-analytics.models';
import { funnelReport } from '../../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { FunnelReport as FunnelReportComponent } from './funnel-report';

const URL = '/api/tutoring/admin/analytics/funnel';

describe('FunnelReport', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    httpMock = TestBed.inject(HttpTestingController);
    useEnglish();
  });

  afterEach(() => httpMock.verify());

  async function mount(segment: FunnelSegment = 'All'): Promise<ComponentFixture<FunnelReportComponent>> {
    const fixture = TestBed.createComponent(FunnelReportComponent);
    fixture.componentRef.setInput('from', '2026-09-15');
    fixture.componentRef.setInput('to', '2026-10-14');
    fixture.componentRef.setInput('segment', segment);
    await settle(fixture);
    return fixture;
  }

  async function answer(fixture: ComponentFixture<FunnelReportComponent>, body: object = funnelReport()): Promise<HTMLElement> {
    httpMock.expectOne((r) => r.url === URL).flush(body);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for the period and the segment', async () => {
    const fixture = await mount('Trial');

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('segment')).toBe('Trial');
    expect(req.request.params.get('from')).toBe('2026-09-15');
    req.flush(funnelReport({ segment: 'Trial' }));
    await settle(fixture);
  });

  it('lists the counts in the order a booking lives them, in four named groups', async () => {
    const root = await answer(await mount());

    const groups = Array.from(root.querySelectorAll('section[aria-labelledby^="funnel-group-"] h3')).map((h) => h.textContent?.trim());
    expect(groups).toEqual(['Before payment', 'After payment', 'How the lessons ended', 'Problems']);
    const labels = Array.from(root.querySelectorAll('section[aria-labelledby^="funnel-group-"] li')).map((li) => li.querySelector('span')?.textContent?.trim());
    expect(labels).toHaveLength(15);
    expect(labels[0]).toBe('Bookings made');
    expect(labels[14]).toBe('Ever disputed');
  });

  it('writes every count next to its bar', async () => {
    const root = await answer(await mount());

    const rows = Array.from(root.querySelectorAll('section[aria-labelledby^="funnel-group-"] li'));
    const completed = rows.find((row) => textOf(row as HTMLElement).includes('Completed')) as HTMLElement;
    expect(textOf(completed)).toContain('50');
    expect(completed.querySelector('app-analytics-bar')).not.toBeNull();
    const created = rows.find((row) => textOf(row as HTMLElement).includes('Bookings made')) as HTMLElement;
    expect(created.querySelector<HTMLElement>('app-analytics-bar [aria-hidden="true"] > div')?.style.width).toBe('100%');
    expect(completed.querySelector<HTMLElement>('app-analytics-bar [aria-hidden="true"] > div')?.style.width).toBe('50%');
  });

  it('shows each rate with the count it is out of, and a rate with nothing to divide by as "not enough data"', async () => {
    const root = await answer(await mount());

    const rates = Array.from(root.querySelectorAll('section[aria-labelledby="funnel-rates-heading"] li')).map((li) => textOf(li as HTMLElement));
    expect(rates).toHaveLength(3);
    expect(rates[0]).toContain('Held slots that were paid');
    expect(rates[0]).toContain('72.9%');
    expect(rates[0]).toContain('70 of 96');
    expect(rates[1]).toContain('83.3%');
    expect(rates[1]).toContain('50 of 60');
    expect(rates[2]).toContain('Nobody attended');
    expect(rates[2]).toContain('Not enough data');
    expect(rates[2]).not.toContain('0%');
  });

  it('leaves out a rate key the screen has no words for, rather than showing an unlabelled number', async () => {
    const root = await answer(await mount());

    expect(textOf(root)).not.toContain('someFutureRate');
    expect(textOf(root)).not.toContain('1 of 2');
  });

  it('says no bookings were made instead of drawing a funnel of zeros', async () => {
    const empty = funnelReport();
    const root = await answer(
      await mount(),
      funnelReport({ counts: { ...empty.counts, created: 0, everConfirmed: 0, completed: 0 }, rates: [] }),
    );

    expect(textOf(root)).toContain('No bookings were made in this period.');
    expect(root.querySelector('section[aria-labelledby^="funnel-group-"]')).toBeNull();
  });

  it('says why the groups are by current state', async () => {
    const root = await answer(await mount());

    expect(textOf(root)).toContain('by their state today');
    expect(textOf(root)).toContain('share of the bookings made in the period');
  });

  it('reports a failure in words', async () => {
    const fixture = await mount();
    httpMock.expectOne((r) => r.url === URL).flush(problemBody(503, 'tutoring.analytics_timeout', 'unavailable'), { status: 503, statusText: 'Service Unavailable' });
    await settle(fixture);

    expect(textOf(fixture.nativeElement as HTMLElement)).toContain('We could not load this report');
  });
});
