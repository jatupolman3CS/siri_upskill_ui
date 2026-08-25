import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CourseBuilderResponse } from '../../catalog/data/course-api.models';
import { CourseBuilderPage } from './course-builder-page';

const CATEGORIES: readonly CategoryTreeNode[] = [
  {
    id: 'cat-web',
    slug: 'web-development',
    nameTh: 'การพัฒนาเว็บ',
    nameEn: 'Web Development',
    iconKey: 'code',
    sortOrder: 0,
    isActive: true,
    children: [],
  },
];

const BUILDER_COURSE: CourseBuilderResponse = {
  id: '00000000-0000-0000-0000-000000000001',
  slug: 'web-dev-pro',
  title: 'Web Dev Pro',
  subtitle: 'Master full stack',
  description: 'Full description',
  instructorId: '00000000-0000-0000-0000-000000000002',
  categoryId: 'cat-web',
  level: 'Beginner',
  language: 'Thai',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  price: 1990,
  comparePrice: 3990,
  currency: 'THB',
  accessDurationDays: 365,
  status: 'Draft',
  seoTitle: 'Web Dev Pro Course',
  seoDescription: 'SEO Desc',
  rowVersion: 'AAAAAAAAB9E=',
  outcomes: ['Build web apps'],
  requirements: ['Basic computer skills'],
  sections: [
    {
      id: '00000000-0000-0000-0000-000000000010',
      title: 'Section 1: Intro',
      sortOrder: 0,
      episodes: [
        {
          id: '00000000-0000-0000-0000-000000000020',
          sectionId: '00000000-0000-0000-0000-000000000010',
          title: 'Lesson 1',
          description: 'Desc',
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

describe('CourseBuilderPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/courses/:id/builder', component: CourseBuilderPage }]),
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

  async function navigate(url: string): Promise<CourseBuilderPage> {
    const component = await harness.navigateByUrl(url, CourseBuilderPage);
    await settle();
    return component;
  }

  function flushCategories(): void {
    const req = httpMock.expectOne((r) => r.url === '/api/catalog/categories');
    req.flush(CATEGORIES);
  }

  function flushBuilderCourse(course: CourseBuilderResponse = BUILDER_COURSE): void {
    const req = httpMock.expectOne((r) => r.url === `/api/catalog/instructor/courses/${course.id}/builder`);
    req.flush(course);
  }

  it('loads course builder data and populates form fields', async () => {
    await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    const titleInput = harness.routeNativeElement?.querySelector('#builderCourseTitle') as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    expect(titleInput.value).toBe('Web Dev Pro');
  });

  it('handles autosave and sends rowVersion concurrency token', async () => {
    const component = await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    // Trigger save
    const saveButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Save Draft'),
    ) as HTMLButtonElement;
    expect(saveButton).toBeTruthy();
    saveButton.click();
    await settle();

    const saveReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses/00000000-0000-0000-0000-000000000001/autosave');
    expect(saveReq.request.method).toBe('PUT');
    expect(saveReq.request.body.rowVersion).toBe('AAAAAAAAB9E=');
    expect(saveReq.request.body.title).toBe('Web Dev Pro');

    saveReq.flush({
      courseId: '00000000-0000-0000-0000-000000000001',
      rowVersion: 'AAAAAAAAB9I=',
      updatedAtUtc: '2026-08-24T12:00:00Z',
    });
    await settle();

    expect(component['rowVersion']()).toBe('AAAAAAAAB9I=');
  });

  it('shows conflict warning on 409 status code during save', async () => {
    await navigate('/instructor/courses/00000000-0000-0000-0000-000000000001/builder');
    flushCategories();
    flushBuilderCourse(BUILDER_COURSE);
    await settle();

    const saveButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Save Draft'),
    ) as HTMLButtonElement;
    saveButton.click();
    await settle();

    const saveReq = httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses/00000000-0000-0000-0000-000000000001/autosave');
    saveReq.flush({ title: 'Conflict', detail: 'Stale token' }, { status: 409, statusText: 'Conflict' });
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('This course was modified elsewhere');
  });
});
