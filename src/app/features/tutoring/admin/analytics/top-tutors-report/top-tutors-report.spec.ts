import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { TopTutorSort } from '../../data/admin-analytics.models';
import { topTutorRow, topTutorsReport } from '../../testing/analytics-fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { TopTutorsReport as TopTutorsReportComponent } from './top-tutors-report';

const URL = '/api/tutoring/admin/analytics/top-tutors';

describe('TopTutorsReport', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS, provideRouter([])] });
    httpMock = TestBed.inject(HttpTestingController);
    useEnglish();
  });

  afterEach(() => httpMock.verify());

  async function mount(sort: TopTutorSort = 'Completed'): Promise<ComponentFixture<TopTutorsReportComponent>> {
    const fixture = TestBed.createComponent(TopTutorsReportComponent);
    fixture.componentRef.setInput('from', '2026-09-15');
    fixture.componentRef.setInput('to', '2026-10-14');
    fixture.componentRef.setInput('sort', sort);
    fixture.componentRef.setInput('top', 20);
    await settle(fixture);
    return fixture;
  }

  async function answer(fixture: ComponentFixture<TopTutorsReportComponent>, body: object = topTutorsReport()): Promise<HTMLElement> {
    httpMock.expectOne((r) => r.url === URL).flush(body);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for the period, the ranking and the number of rows', async () => {
    const fixture = await mount('Rating');

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('sort')).toBe('Rating');
    expect(req.request.params.get('top')).toBe('20');
    expect(req.request.params.get('from')).toBe('2026-09-15');
    req.flush(topTutorsReport({ sort: 'Rating' }));
    await settle(fixture);
  });

  it('lists the tutors in the order the server ranked them, numbered from 1', async () => {
    const root = await answer(await mount());

    const rows = Array.from(root.querySelectorAll('tbody tr')).map((row) => textOf(row as HTMLElement));
    expect(rows).toHaveLength(2);
    expect(rows[0].startsWith('1Nina Tutor')).toBe(true);
    expect(rows[1].startsWith('2Kan Tutor')).toBe(true);
  });

  it('shows the signals an administrator weighs a tutor by', async () => {
    const root = await answer(await mount());

    const first = textOf(root.querySelector('tbody tr') as HTMLElement);
    expect(first).toContain('18');
    expect(first).toContain('16');
    expect(first).toContain('฿8,100.00');
    expect(first).toContain('4.8 (12 reviews)');
    expect(first).toContain('98.5');
  });

  it('links a tutor to their record in the admin area, by id, and shows only the public name', async () => {
    const root = await answer(await mount());

    const link = root.querySelector('tbody tr a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Nina Tutor');
    expect(link.getAttribute('href')).toBe('/admin/tutoring/tutors/tutor-1');
    expect(textOf(root)).not.toContain('@');
  });

  it('words the status of a tutor, and shows a status it has no word for as the server sent it', async () => {
    const root = await answer(
      await mount(),
      topTutorsReport({ tutors: [topTutorRow({ status: 'Verified' }), topTutorRow({ tutorId: 't2', displayName: 'Odd', status: 'SomethingNew' })] }),
    );

    const rows = Array.from(root.querySelectorAll('tbody tr')).map((row) => textOf(row as HTMLElement));
    expect(rows[0]).toContain('Verified');
    expect(rows[1]).toContain('SomethingNew');
  });

  it('says that booked value is not what the tutor earned', async () => {
    const root = await answer(await mount());

    expect(textOf(root)).toContain('It is not what the tutor earned.');
  });

  it('explains that a rating ranking lists only tutors with enough reviews, but only for that ranking', async () => {
    const rated = await answer(await mount('Rating'), topTutorsReport({ sort: 'Rating' }));
    expect(textOf(rated)).toContain('lists only tutors with enough reviews');
  });

  it('does not add that note to the other rankings', async () => {
    const root = await answer(await mount());

    expect(textOf(root)).not.toContain('enough reviews');
  });

  it('says so when no tutor completed a lesson, instead of an empty table', async () => {
    const root = await answer(await mount(), topTutorsReport({ tutors: [] }));

    expect(root.querySelector('table')).toBeNull();
    expect(textOf(root)).toContain('No tutor completed a lesson in this period.');
  });

  it('reports a failure in words', async () => {
    const fixture = await mount();
    httpMock.expectOne((r) => r.url === URL).flush(problemBody(403, 'tutoring.forbidden', 'forbidden'), { status: 403, statusText: 'Forbidden' });
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    expect(textOf(root)).toContain('We could not load this report');
    expect(root.querySelector('table')).toBeNull();
  });
});
