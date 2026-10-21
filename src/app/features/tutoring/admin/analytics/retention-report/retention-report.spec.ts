import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../../core/i18n/translation.service';
import { retentionCohort, retentionReport } from '../../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { RetentionReport as RetentionReportComponent } from './retention-report';

const URL = '/api/tutoring/admin/analytics/retention';

describe('RetentionReport', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    httpMock = TestBed.inject(HttpTestingController);
    useEnglish();
  });

  afterEach(() => httpMock.verify());

  async function mount(): Promise<ComponentFixture<RetentionReportComponent>> {
    const fixture = TestBed.createComponent(RetentionReportComponent);
    fixture.componentRef.setInput('fromMonth', '2026-07');
    fixture.componentRef.setInput('toMonth', '2026-10');
    await settle(fixture);
    return fixture;
  }

  async function answer(fixture: ComponentFixture<RetentionReportComponent>, body: object = retentionReport()): Promise<HTMLElement> {
    httpMock.expectOne((r) => r.url === URL).flush(body);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for the months it was given', async () => {
    const fixture = await mount();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('fromMonth')).toBe('2026-07');
    expect(req.request.params.get('toMonth')).toBe('2026-10');
    req.flush(retentionReport());
    await settle(fixture);
  });

  it('writes one row per first-lesson month plus the server total, with the month names in words', async () => {
    const root = await answer(await mount());

    const rows = Array.from(root.querySelectorAll('tbody tr')).map((row) => textOf(row as HTMLElement));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('July 2026');
    expect(rows[1]).toContain('August 2026');
    expect(textOf(root.querySelector('tfoot') as HTMLElement)).toContain('All months');
    expect(textOf(root.querySelector('tfoot') as HTMLElement)).toContain('23');
  });

  it('shows each rate with the counts it is out of', async () => {
    const root = await answer(await mount());

    const first = textOf(root.querySelector('tbody tr') as HTMLElement);
    expect(first).toContain('45%');
    expect(first).toContain('9 of 20');
    expect(first).toContain('60%');
    expect(first).toContain('12 of 20');
    expect(first).toContain('35%');
    expect(first).toContain('7 of 20');
  });

  it('shows a withheld rate as "not enough data" - a cohort that is too small is not a rate of zero', async () => {
    const root = await answer(await mount());

    const small = root.querySelectorAll('tbody tr')[1] as HTMLElement;
    expect(textOf(small)).toContain('Not enough data');
    expect(textOf(small)).not.toContain('%');
    expect(textOf(small)).toContain('1 of 3');
    expect(small.querySelectorAll('app-rate-cell')).toHaveLength(4);
  });

  it('keeps a real 0% apart from a withheld rate', async () => {
    const root = await answer(
      await mount(),
      retentionReport({ cohorts: [retentionCohort({ cohortMonth: '2026-07', retained30: 0, rate30: 0 })] }),
    );

    const first = textOf(root.querySelector('tbody tr') as HTMLElement);
    expect(first).toContain('0%');
    expect(first).toContain('0 of 20');
  });

  it('uses the all-months row the server sent, and does not average the rows', async () => {
    const root = await answer(await mount());

    const foot = textOf(root.querySelector('tfoot') as HTMLElement);
    expect(foot).toContain('43.5%');
    expect(foot).toContain('10 of 23');
    expect(foot).toContain('56.5%');
  });

  it('states the privacy minimum behind the withheld rates', async () => {
    const root = await answer(await mount());

    expect(textOf(root)).toContain('A rate is only shown for a group of at least 5 learners.');
    expect(textOf(root)).toContain('First lessons from July 2026 to October 2026.');
  });

  it('says so when nobody completed a first lesson, instead of an empty table', async () => {
    const root = await answer(await mount(), retentionReport({ cohorts: [] }));

    expect(root.querySelector('table')).toBeNull();
    expect(textOf(root)).toContain('No learner completed a first lesson in these months.');
  });

  it('follows the language of the header for month names', async () => {
    const fixture = await mount();
    const root = await answer(fixture);

    TestBed.inject(TranslationService).setLocale('th');
    await settle(fixture);

    expect(textOf(root.querySelector('tbody tr') as HTMLElement)).not.toContain('July 2026');
    expect(textOf(root.querySelector('tbody tr') as HTMLElement)).toContain('2026');
  });

  it('reports a refused month range in words, naming the limit the server gave', async () => {
    const fixture = await mount();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush(problemBody(400, 'tutoring.analytics_range_invalid', 'validation', { maxMonths: 24 }), { status: 400, statusText: 'Bad Request' });
    await settle(fixture);

    expect(textOf(fixture.nativeElement as HTMLElement)).toContain('24');
  });
});
