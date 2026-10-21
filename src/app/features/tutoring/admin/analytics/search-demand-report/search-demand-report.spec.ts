import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../../core/i18n/translation.service';
import { searchDemandReport } from '../../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { SearchDemandReport as SearchDemandReportComponent } from './search-demand-report';

const URL = '/api/tutoring/admin/analytics/search-demand';

describe('SearchDemandReport', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    httpMock = TestBed.inject(HttpTestingController);
    useEnglish();
  });

  afterEach(() => httpMock.verify());

  async function mount(): Promise<ComponentFixture<SearchDemandReportComponent>> {
    const fixture = TestBed.createComponent(SearchDemandReportComponent);
    fixture.componentRef.setInput('from', '2026-09-15');
    fixture.componentRef.setInput('to', '2026-10-14');
    fixture.componentRef.setInput('top', 10);
    await settle(fixture);
    return fixture;
  }

  async function answer(fixture: ComponentFixture<SearchDemandReportComponent>, body: object = searchDemandReport()): Promise<HTMLElement> {
    httpMock.expectOne((r) => r.url === URL).flush(body);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for the period and the number of rows', async () => {
    const fixture = await mount();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('from')).toBe('2026-09-15');
    expect(req.request.params.get('to')).toBe('2026-10-14');
    expect(req.request.params.get('top')).toBe('10');
    req.flush(searchDemandReport());
    await settle(fixture);
  });

  it('shows the three totals, with the privacy threshold behind the number of hidden searches', async () => {
    const root = await answer(await mount());

    const tiles = Array.from(root.querySelectorAll('app-kpi-tile')).map((tile) => textOf(tile as HTMLElement));
    expect(tiles[0]).toContain('Searches');
    expect(tiles[0]).toContain('340');
    expect(tiles[1]).toContain('Searches with no tutor found');
    expect(tiles[1]).toContain('41');
    expect(tiles[2]).toContain('Searches not listed');
    expect(tiles[2]).toContain('12');
    expect(tiles[2]).toContain('fewer than 5 searches');
  });

  it('lists each subject in the language of the header, with its group flag and its share with no tutor', async () => {
    const root = await answer(await mount());

    const rows = Array.from(root.querySelectorAll('tbody tr')).map((row) => textOf(row as HTMLElement));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Physics');
    expect(rows[0]).toContain('120');
    expect(rows[0]).toContain('5%');
    expect(rows[1]).toContain('Mathematics');
    expect(rows[1]).toContain('Subject group');
    expect(rows[1]).toContain('50%');
    expect(rows[0]).not.toContain('Subject group');
  });

  it('names the subjects in Thai when the header is Thai', async () => {
    const fixture = await mount();
    const root = await answer(fixture);
    expect(textOf(root)).toContain('Physics');

    TestBed.inject(TranslationService).setLocale('th');
    await settle(fixture);

    expect(textOf(root)).toContain('Physics (TH)');
  });

  it('shows search texts as plain text and never as markup', async () => {
    const root = await answer(await mount());

    const item = root.querySelector('section[aria-labelledby="search-queries-heading"] li') as HTMLElement;
    expect(item.textContent).toContain('gat english <b>online</b>');
    expect(item.querySelector('b')).toBeNull();
  });

  it('says there is not enough data - not that nobody searched - when every subject was too small to list', async () => {
    const root = await answer(
      await mount(),
      searchDemandReport({ topSubjects: [], topQueries: [], totalSearches: 9, suppressedSearchCount: 9 }),
    );

    expect(textOf(root)).toContain('Not enough data to list a subject');
    expect(textOf(root)).toContain('fewer than 5 times');
    expect(textOf(root)).not.toContain('Nobody searched in this period.');
    expect(root.querySelector('table')).toBeNull();
  });

  it('says nobody searched only when there were no searches at all', async () => {
    const root = await answer(
      await mount(),
      searchDemandReport({ topSubjects: [], topQueries: [], totalSearches: 0, totalZeroResult: 0, suppressedSearchCount: 0 }),
    );

    expect(textOf(root)).toContain('Nobody searched in this period.');
    expect(textOf(root)).not.toContain('Not enough data to list');
  });

  it('explains that the period starts later than asked when the server kept less history', async () => {
    const root = await answer(await mount(), searchDemandReport({ effectiveFrom: '2026-09-20' }));

    expect(root.querySelector('[role="status"]:not([aria-label])')?.textContent).toContain('the period starts later than you asked');
  });

  it('stays quiet about the start when the server used the period asked for', async () => {
    const root = await answer(await mount());

    expect(textOf(root)).not.toContain('starts later than you asked');
  });

  it('leaves out the search texts section when the server listed none', async () => {
    const root = await answer(await mount(), searchDemandReport({ topQueries: [] }));

    expect(root.querySelector('#search-queries-heading')).toBeNull();
  });

  it('reports a failure in words', async () => {
    const fixture = await mount();
    httpMock.expectOne((r) => r.url === URL).flush(problemBody(403, 'tutoring.forbidden', 'forbidden'), { status: 403, statusText: 'Forbidden' });
    await settle(fixture);

    expect(textOf(fixture.nativeElement as HTMLElement)).toContain('We could not load this report');
  });
});
