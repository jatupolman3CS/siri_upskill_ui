import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import type { CourseDetailResponse } from '../data/course-api.models';
import { CourseDetailPage } from './course-detail-page';

registerLocaleData(localeTh);

@Component({ template: '' })
class DummyComponent {}

const BASE: CourseDetailResponse = {
  id: 'course-1',
  slug: 'excel-pro',
  title: 'Excel Pro',
  subtitle: null,
  description: 'Full course description.',
  level: 'Beginner',
  language: 'Thai',
  thumbnailUrl: null,
  price: 1490,
  comparePrice: null,
  currency: 'THB',
  accessDurationDays: null,
  ratingAverage: 0,
  ratingCount: 0,
  enrollmentCount: 5,
  episodeCount: 2,
  totalDurationSeconds: 1200,
  seoTitle: null,
  seoDescription: null,
  publishedAtUtc: '2026-01-01T00:00:00Z',
  categoryId: 'cat-1',
  instructor: { id: 'i1', displayName: 'Teacher', headline: null, avatarUrl: null },
  outcomes: [],
  requirements: [],
  sections: [
    {
      id: 's1',
      title: 'Basics',
      sortOrder: 0,
      episodes: [{ id: 'e1', title: 'Welcome', sortOrder: 0, durationSeconds: 600, isFreePreview: false }],
    },
  ],
};

const LIVE_SCHEDULE = {
  timezone: 'Asia/Bangkok',
  upcomingCount: 2,
  pastCount: 1,
  nextStartsAtUtc: '2026-10-09T03:00:00Z',
  sessions: [
    { id: 'p1', title: 'Session 1: basics', startsAtUtc: '2026-10-01T03:00:00Z', endsAtUtc: '2026-10-01T05:00:00Z', displayState: 'Ended', hasRecording: true },
    { id: 'u1', title: 'Session 2: formulas', startsAtUtc: '2026-10-09T03:00:00Z', endsAtUtc: '2026-10-09T05:00:00Z', displayState: 'Upcoming', hasRecording: false },
    { id: 'u2', title: 'Session 3: pivots', startsAtUtc: '2026-10-16T18:00:00Z', endsAtUtc: '2026-10-16T20:00:00Z', displayState: 'Upcoming', hasRecording: false },
    { id: 'c1', title: 'Session 4: cancelled', startsAtUtc: '2026-10-23T03:00:00Z', endsAtUtc: '2026-10-23T05:00:00Z', displayState: 'Cancelled', hasRecording: false },
  ],
} as const;

describe('CourseDetailPage — live schedule (P11-21)', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'courses/:slug', component: CourseDetailPage },
          { path: 'cart', component: DummyComponent },
        ]),
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

  async function load(course: CourseDetailResponse): Promise<void> {
    await harness.navigateByUrl('/courses/excel-pro', CourseDetailPage);
    await settle();
    httpMock.expectOne((r) => r.url === '/api/catalog/courses/excel-pro').flush(course);
    await settle();
    for (const req of httpMock.match((r) => r.url.endsWith('/reviews'))) {
      req.flush({ averageRating: 0, ratingCount: 0, items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
    }
    for (const req of httpMock.match((r) => r.url === '/api/catalog/categories')) {
      req.flush([]);
    }
    await settle();
  }

  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => root().textContent ?? '';

  it('a Hybrid course shows the schedule between the description and the syllabus, in Bangkok time with the server states', async () => {
    await load({ ...BASE, deliveryFormat: 'Hybrid', liveSchedule: LIVE_SCHEDULE });

    const section = root().querySelector('app-course-live-schedule') as HTMLElement;
    expect(section).not.toBeNull();
    const body = text();
    expect(body.indexOf('Full course description.')).toBeLessThan(body.indexOf('Live schedule'));
    expect(body.indexOf('Live schedule')).toBeLessThan(body.indexOf('Basics'));

    const sectionText = section.textContent ?? '';
    expect(sectionText).toContain('Hybrid');
    expect(sectionText).toContain('2 upcoming · 1 past');
    expect(sectionText).toContain('Session 2: formulas');
    expect(sectionText).toContain('Thailand time');
    // 03:00Z -> 10:00 in Bangkok; 18:00Z -> 01:00 the next calendar day there
    expect(sectionText).toContain('10:00–12:00');
    expect(sectionText).toContain('01:00–03:00');
    // states come straight from the API
    expect(sectionText).toContain('Ended');
    expect(sectionText).toContain('Upcoming');
    expect(sectionText).toContain('Cancelled');
    expect(sectionText).toContain('Recording available');
  });

  it('never exposes a room link anywhere on the page, and makes no call to the Live module', async () => {
    await load({ ...BASE, deliveryFormat: 'Live', liveSchedule: LIVE_SCHEDULE });

    expect(root().querySelector('a[href*="meet.google"], a[href*="zoom.us"]')).toBeNull();
    expect(text()).not.toMatch(/https:\/\/(meet\.google|zoom\.us|teams\.microsoft)/);
    expect(text()).toContain('only shown to enrolled learners');
    httpMock.expectNone((r) => r.url.startsWith('/api/live/'));
  });

  it('the price card shows the next session and how many sessions can be replayed', async () => {
    await load({ ...BASE, deliveryFormat: 'Live', liveSchedule: LIVE_SCHEDULE });

    const summary = root().querySelector('app-course-live-summary') as HTMLElement;
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain('Next session: 9 Oct 10:00');
    expect(summary.textContent).toContain('Replay available for 1 session(s)');
  });

  it('with no upcoming session the price card says so, and shows no replay line when nothing was recorded', async () => {
    await load({
      ...BASE,
      deliveryFormat: 'Live',
      liveSchedule: { ...LIVE_SCHEDULE, upcomingCount: 0, nextStartsAtUtc: null, sessions: [LIVE_SCHEDULE.sessions[1]] },
    });

    const summary = root().querySelector('app-course-live-summary') as HTMLElement;
    expect(summary.textContent).toContain('No upcoming session scheduled.');
    expect(summary.textContent).not.toContain('Replay available');
  });

  it('a Live course with no sessions scheduled says so instead of an empty list', async () => {
    await load({
      ...BASE,
      deliveryFormat: 'Live',
      liveSchedule: { timezone: 'Asia/Bangkok', upcomingCount: 0, pastCount: 0, nextStartsAtUtc: null, sessions: [] },
    });
    expect(text()).toContain('has not scheduled any live sessions yet');
    expect(root().querySelector('app-course-live-schedule ul')).toBeNull();
  });

  it('a long schedule collapses behind "show more"', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: `n${index}`,
      title: `Weekly session ${index + 1}`,
      startsAtUtc: '2026-11-01T03:00:00Z',
      endsAtUtc: '2026-11-01T05:00:00Z',
      displayState: 'Upcoming' as const,
      hasRecording: false,
    }));
    await load({ ...BASE, deliveryFormat: 'Live', liveSchedule: { ...LIVE_SCHEDULE, sessions: many } });

    expect(root().querySelectorAll('app-course-live-schedule li').length).toBe(8);
    const toggle = Array.from(root().querySelectorAll('app-course-live-schedule button')).find((b) =>
      b.textContent?.includes('Show 4 more'),
    ) as HTMLButtonElement;
    toggle.click();
    await settle();
    expect(root().querySelectorAll('app-course-live-schedule li').length).toBe(12);
  });

  it('an on-demand course (liveSchedule null) shows no live section at all', async () => {
    await load({ ...BASE, deliveryFormat: 'OnDemand', liveSchedule: null });
    expect(root().querySelector('app-course-live-schedule')).toBeNull();
    expect(root().querySelector('app-course-live-summary')).toBeNull();
    expect(text()).not.toContain('Live schedule');
  });

  it('an older response without the live fields renders exactly as before', async () => {
    await load(BASE);
    expect(root().querySelector('app-course-live-schedule')).toBeNull();
  });
});
