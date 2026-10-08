import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CourseBuilderResponse } from '../../catalog/data/course-api.models';
import { LiveSubmitIssues } from '../../live/data/live-submit-issues.service';
import { CourseBuilderPage } from './course-builder-page';

registerLocaleData(localeTh);


const COURSE_ID = '00000000-0000-0000-0000-000000000001';
const SECTION_ID = '00000000-0000-0000-0000-000000000010';

const CATEGORIES: readonly CategoryTreeNode[] = [
  { id: 'cat-web', slug: 'web', nameTh: 'เว็บ', nameEn: 'Web', iconKey: 'code', sortOrder: 0, isActive: true, children: [] },
];

const COURSE: CourseBuilderResponse = {
  id: COURSE_ID,
  slug: 'excel-pro',
  title: 'Excel Pro',
  subtitle: null,
  description: null,
  instructorId: 'i1',
  categoryId: 'cat-web',
  level: 'Beginner',
  language: 'Thai',
  thumbnailUrl: null,
  price: 1490,
  comparePrice: null,
  currency: 'THB',
  accessDurationDays: null,
  status: 'Draft',
  trailerMediaAssetId: null,
  seoTitle: null,
  seoDescription: null,
  rowVersion: 'AAAAAAAAB9E=',
  outcomes: [],
  requirements: [],
  sections: [
    {
      id: SECTION_ID,
      title: 'Basics',
      sortOrder: 0,
      episodes: [
        {
          id: '00000000-0000-0000-0000-000000000020',
          sectionId: SECTION_ID,
          title: 'Welcome',
          description: null,
          sortOrder: 0,
          isFreePreview: true,
          mediaAssetId: null,
          durationSeconds: 300,
          status: 'Draft',
        },
      ],
    },
  ],
};

describe('CourseBuilderPage — live schedule tab (P11)', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'instructor/courses/:id/builder', component: CourseBuilderPage },
          { path: 'instructor/courses/new', component: CourseBuilderPage },
          { path: 'instructor', component: CourseBuilderPage },
        ]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
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

  async function openSaved(): Promise<CourseBuilderPage> {
    const component = await harness.navigateByUrl(`/instructor/courses/${COURSE_ID}/builder`, CourseBuilderPage);
    await settle();
    httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush(CATEGORIES);
    httpMock.expectOne((r) => r.url === `/api/catalog/instructor/courses/${COURSE_ID}/builder`).flush(COURSE);
    await settle();
    return component;
  }

  const root = () => harness.routeNativeElement as HTMLElement;
  const tab = (label: string) =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

  it('a saved course gets a "Live schedule" tab that mounts the panel and loads its data', async () => {
    await openSaved();
    expect(root().querySelector('app-live-schedule-panel')).toBeNull();

    tab('Live schedule')?.click();
    await settle();

    expect(root().querySelector('app-live-schedule-panel')).not.toBeNull();
    httpMock.expectOne(`/api/catalog/instructor/courses/${COURSE_ID}/live-schedule`).flush({
      courseId: COURSE_ID,
      deliveryFormat: 'OnDemand',
      status: 'Draft',
      enrollmentDeadlineUtc: null,
      maxSeats: null,
      seatsUsed: 0,
      googleAttendeeSyncEnabled: false,
      sessions: [],
    });
    httpMock.expectOne(`/api/live/instructor/courses/${COURSE_ID}/meetings`).flush({ items: [] });
    httpMock
      .expectOne((r) => r.url === '/api/live/instructor/sessions')
      .flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
    httpMock.expectOne('/api/live/instructor/google/status').flush({ configured: true, connected: true, needsReconnect: false });
    await settle();
  });

  it('a course that has not been saved yet has no Live tab (sessions need a real course id)', async () => {
    await harness.navigateByUrl('/instructor/courses/new', CourseBuilderPage);
    await settle();
    httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush(CATEGORIES);
    await settle();

    expect(tab('Live schedule')).toBeUndefined();
  });

  it('a refused submit (live.meetings_not_ready) jumps to the live tab, explains why, and marks the named sessions', async () => {
    const component = await openSaved();
    component['sections'].update((sections) =>
      sections.map((section) => ({
        ...section,
        episodes: section.episodes.map((episode) => ({ ...episode, mediaAssetId: 'asset', videoStatus: 'ready' as const })),
      })),
    );

    component.publishCourse();
    httpMock
      .expectOne(`/api/catalog/instructor/courses/${COURSE_ID}/autosave`)
      .flush({ courseId: COURSE_ID, rowVersion: 'AAAAAAAAB9F=', updatedAtUtc: '2026-10-07T00:00:00Z' });
    await settle();
    httpMock
      .expectOne(`/api/catalog/instructor/courses/${COURSE_ID}/submit-for-review`)
      .flush(
        { status: 400, errorCode: 'validation', reason: 'live.meetings_not_ready', sessionIds: ['s1', 's2'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(TestBed.inject(LiveSubmitIssues).notReadySessionIds()).toEqual(['s1', 's2']);
    expect(component['activeTab']()).toBe('live');
    expect(component['errorMessage']()).toBe('live.builder.meetingsNotReady');
    expect(root().textContent).toContain('Cannot submit for review');
    expect(root().querySelector('app-live-schedule-panel')).not.toBeNull();

    // the panel's own initial requests
    httpMock.match((r) => r.url.includes('live-schedule') || r.url.includes('/meetings') || r.url.includes('/live/instructor/')).forEach((req) => {
      req.flush(
        req.request.url.includes('live-schedule')
          ? { courseId: COURSE_ID, deliveryFormat: 'Live', status: 'Draft', enrollmentDeadlineUtc: null, maxSeats: null, seatsUsed: 0, googleAttendeeSyncEnabled: false, sessions: [] }
          : req.request.url.includes('google')
            ? { configured: true, connected: true, needsReconnect: false }
            : req.request.url.includes('/meetings')
              ? { items: [] }
              : { items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 },
      );
    });
    await settle();
  });

  it('any other submit failure keeps the generic message and stays on the current tab', async () => {
    const component = await openSaved();
    component['sections'].update((sections) =>
      sections.map((section) => ({
        ...section,
        episodes: section.episodes.map((episode) => ({ ...episode, mediaAssetId: 'asset', videoStatus: 'ready' as const })),
      })),
    );

    component.publishCourse();
    httpMock
      .expectOne(`/api/catalog/instructor/courses/${COURSE_ID}/autosave`)
      .flush({ courseId: COURSE_ID, rowVersion: 'AAAAAAAAB9F=', updatedAtUtc: '2026-10-07T00:00:00Z' });
    await settle();
    httpMock
      .expectOne(`/api/catalog/instructor/courses/${COURSE_ID}/submit-for-review`)
      .flush({ status: 500 }, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(component['activeTab']()).toBe('basic');
    expect(component['errorMessage']()).toBe('instructor.builder.saveFailed');
    expect(TestBed.inject(LiveSubmitIssues).notReadySessionIds()).toEqual([]);
  });
});
