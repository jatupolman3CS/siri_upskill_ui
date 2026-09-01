import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { CartStore } from '../../commerce/cart/cart-store.service';
import { CategoryTreeNode } from '../data/category-api.models';
import { CourseDetailResponse, CourseReviewSummaryResponse } from '../data/course-api.models';
import { CourseDetailPage } from './course-detail-page';

@Component({ template: '' })
class DummyCartComponent {}

const CATEGORIES: readonly CategoryTreeNode[] = [
  {
    id: 'cat-programming',
    slug: 'programming-technology',
    nameTh: 'การเขียนโปรแกรมและเทคโนโลยี',
    nameEn: 'Programming & Technology',
    iconKey: 'code',
    sortOrder: 0,
    isActive: true,
    children: [],
  },
];

const COURSE: CourseDetailResponse = {
  id: 'course-1',
  slug: 'python-for-beginners',
  title: 'Python for Beginners',
  subtitle: 'Learn Python from scratch',
  description: 'A full description of the course.',
  level: 'Beginner',
  language: 'Thai',
  thumbnailUrl: null,
  price: 990,
  comparePrice: 1990,
  currency: 'THB',
  accessDurationDays: null,
  ratingAverage: 0,
  ratingCount: 0,
  enrollmentCount: 42,
  episodeCount: 3,
  totalDurationSeconds: 5400,
  seoTitle: null,
  seoDescription: null,
  publishedAtUtc: '2026-01-01T00:00:00Z',
  categoryId: 'cat-programming',
  instructor: { id: 'instructor-1', displayName: 'ธนกฤต ศรีสุวรรณ', headline: 'Senior Developer', avatarUrl: null },
  outcomes: ['Understand Python basics', 'Build small scripts'],
  requirements: ['A computer'],
  sections: [
    {
      id: 'section-1',
      title: 'Getting Started',
      sortOrder: 0,
      episodes: [
        { id: 'ep-1', title: 'Welcome', sortOrder: 0, durationSeconds: 300, isFreePreview: true },
        { id: 'ep-2', title: 'Setup', sortOrder: 1, durationSeconds: 600, isFreePreview: false },
      ],
    },
    {
      id: 'section-2',
      title: 'Next Steps',
      sortOrder: 1,
      episodes: [{ id: 'ep-3', title: 'Variables', sortOrder: 0, durationSeconds: 900, isFreePreview: false }],
    },
  ],
};

describe('CourseDetailPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'courses/:slug', component: CourseDetailPage },
          { path: 'cart', component: DummyCartComponent },
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

  async function navigate(url: string): Promise<CourseDetailPage> {
    const component = await harness.navigateByUrl(url, CourseDetailPage);
    await settle();
    return component;
  }

  function flushReviews(
    reviews: CourseReviewSummaryResponse = {
      averageRating: 0,
      ratingCount: 0,
      distribution: { star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 },
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    },
    courseId = 'course-1'
  ): Promise<void> {
    const reqs = httpMock.match((r) => r.url === `/api/catalog/courses/${courseId}/reviews`);
    for (const rReq of reqs) {
      rReq.flush(reviews);
    }
    return settle();
  }

  async function flushCourse(response: CourseDetailResponse | null, slug = 'python-for-beginners', status = 200): Promise<void> {
    const req = httpMock.expectOne((r) => r.url === `/api/catalog/courses/${slug}`);
    if (status === 200) {
      req.flush(response);
      await settle();
      if (response) {
        await flushReviews(undefined, response.id);
      }
    } else {
      req.flush({ title: 'Not Found', detail: 'ไม่พบคอร์สนี้' }, { status, statusText: 'Error' });
      await settle();
    }
  }

  function flushCategories(categories: readonly CategoryTreeNode[] = []): Promise<void> {
    httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush(categories);
    return settle();
  }

  function failCategories(status = 500): Promise<void> {
    httpMock
      .expectOne((r) => r.url === '/api/catalog/categories')
      .flush({ title: 'Server Error' }, { status, statusText: 'Error' });
    return settle();
  }

  it('shows a busy skeleton with no title/syllabus while the course is still loading', async () => {
    await navigate('/courses/python-for-beginners');

    expect(harness.routeNativeElement?.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Python for Beginners');

    await flushCourse(COURSE);
    await flushCategories();
  });

  it('renders title, breadcrumb with resolved category, price, and outcomes once loaded', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await flushCategories(CATEGORIES);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Python for Beginners');
    expect(text).toContain('Understand Python basics');
    expect(text).toContain('Programming & Technology');

    const breadcrumbLinks = Array.from(harness.routeNativeElement?.querySelectorAll('nav a') ?? []) as HTMLAnchorElement[];
    expect(breadcrumbLinks.some((a) => a.getAttribute('href') === '/courses?category=programming-technology')).toBe(true);
  });

  it('sets canonical/OG/hreflang and Course+BreadcrumbList JSON-LD once loaded (task P1-24)', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await flushCategories(CATEGORIES);

    const document = TestBed.inject(DOCUMENT);
    const origin = document.location.origin;

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${origin}/courses/python-for-beginners`);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain('Python for Beginners');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${origin}/courses/python-for-beginners`);
    for (const hreflang of ['th', 'en', 'x-default']) {
      expect(document.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`)?.getAttribute('href')).toBe(
        `${origin}/courses/python-for-beginners`,
      );
    }

    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    expect(scripts.length).toBe(2);

    const course = JSON.parse(scripts[0].textContent ?? '{}');
    expect(course['@type']).toBe('Course');
    expect(course.name).toBe('Python for Beginners');
    // COURSE fixture has ratingCount: 0 — must not fabricate an aggregateRating for a course nobody
    // has actually rated (see buildCourseJsonLd's own doc comment).
    expect(course.aggregateRating).toBeUndefined();

    const breadcrumbList = JSON.parse(scripts[1].textContent ?? '{}');
    expect(breadcrumbList['@type']).toBe('BreadcrumbList');
    expect(breadcrumbList.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Browse courses', item: `${origin}/courses` },
      { '@type': 'ListItem', position: 3, name: 'Programming & Technology', item: `${origin}/courses?category=programming-technology` },
      { '@type': 'ListItem', position: 4, name: 'Python for Beginners', item: `${origin}/courses/python-for-beginners` },
    ]);
  });

  // Single navigation per test — deliberate, matching every other test in this file (see the
  // "sets a real document title..." tests' own comment for why double-navigating one harness is
  // avoided here). SeoService's own spec separately proves stale JSON-LD gets cleared across calls.
  it('sets robots=noindex and no JSON-LD on a 404', async () => {
    await navigate('/courses/does-not-exist');
    await flushCourse(null, 'does-not-exist', 404);
    await flushCategories();

    const document = TestBed.inject(DOCUMENT);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
  });

  it('still renders the course successfully when the categories fetch fails (breadcrumb just skips the category crumb)', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await failCategories();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Python for Beginners');
    expect(text).not.toContain('Programming & Technology');

    const breadcrumbLinks = Array.from(harness.routeNativeElement?.querySelectorAll('nav a') ?? []) as HTMLAnchorElement[];
    expect(breadcrumbLinks.map((a) => a.textContent?.trim())).toEqual(['Home', 'Browse courses']);
  });

  it('expands only the first section by default; toggling reveals/hides the rest', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await flushCategories();

    // Both <ul>s are always in the DOM now (a11y fix — aria-controls must always resolve to a real
    // element), so this checks the `hidden` property directly rather than textContent presence
    // (textContent includes hidden descendants; it can't tell collapsed from expanded any more).
    const firstSectionList = harness.routeNativeElement?.querySelector('ul#syllabus-section-section-1') as HTMLUListElement;
    const secondSectionList = harness.routeNativeElement?.querySelector('ul#syllabus-section-section-2') as HTMLUListElement;
    expect(firstSectionList.hidden).toBe(false);
    expect(secondSectionList.hidden).toBe(true);

    const toggles = Array.from(harness.routeNativeElement?.querySelectorAll('button[aria-controls]') ?? []) as HTMLButtonElement[];
    expect(toggles.length).toBe(2);
    toggles[1].click();
    harness.detectChanges();

    expect(secondSectionList.hidden).toBe(false);
  });

  it('shows the free-preview badge only on the free-preview episode', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await flushCategories();

    const rows = Array.from(harness.routeNativeElement?.querySelectorAll('ul[id^="syllabus-section-"] li') ?? []);
    const welcomeRow = rows.find((row) => row.textContent?.includes('Welcome'));
    const setupRow = rows.find((row) => row.textContent?.includes('Setup'));

    expect(welcomeRow?.textContent).toContain('Free preview');
    expect(setupRow?.textContent).not.toContain('Free preview');
  });

  it('enables buy now and add to cart buttons, adding course to cart on click', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await flushCategories();

    const cartStore = TestBed.inject(CartStore);
    cartStore.clearCart();
    expect(cartStore.items().length).toBe(0);

    const buyButtons = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).filter((b) =>
      b.textContent?.includes('Buy this course'),
    ) as HTMLButtonElement[];
    expect(buyButtons.length).toBeGreaterThan(0);
    expect(buyButtons.every((b) => !b.disabled)).toBe(true);

    buyButtons[0].click();
    await settle();

    expect(cartStore.items().some((i) => i.courseId === 'course-1')).toBe(true);
  });

  it('shows "no reviews yet" when ratingCount is 0', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await flushCategories();

    expect(harness.routeNativeElement?.textContent).toContain('No reviews yet for this course');
  });

  it('shows a not-found state (with a link back to /courses) on a 404, not the generic error state', async () => {
    await navigate('/courses/does-not-exist');
    await flushCourse(null, 'does-not-exist', 404);
    await flushCategories();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Course not found');
    expect(text).not.toContain("Couldn't load this course");

    const backLink = harness.routeNativeElement?.querySelector('a[href="/courses"]');
    expect(backLink).not.toBeNull();
  });

  it('shows the generic error state (not not-found) on a non-404 failure, and retry re-fetches', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(null, 'python-for-beginners', 500);

    let text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain("Couldn't load this course");
    expect(text).not.toContain('Course not found');

    const retryButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Try again',
    ) as HTMLButtonElement;
    expect(retryButton).toBeTruthy();
    retryButton.click();
    await settle();

    await flushCourse(COURSE);
    await flushCategories();

    text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Python for Beginners');
  });

  it('sets robots=noindex and no JSON-LD on a non-404 failure too, not just a 404 (regression: used to leave stale SEO from whatever loaded before)', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(null, 'python-for-beginners', 500);
    await flushCategories();

    const document = TestBed.inject(DOCUMENT);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
  });

  // Two separate tests (not one navigating twice through the same harness) — deliberate, matching
  // every other spec in this codebase (CoursesPage's own spec included): each `it()` here does exactly
  // one `navigateByUrl`, keeping this file's async router-navigation lifecycle as simple and
  // uncontroversial as everywhere else it's already been proven stable.
  it('sets a real document title once the course loads successfully', async () => {
    await navigate('/courses/python-for-beginners');
    await flushCourse(COURSE);
    await flushCategories();

    expect(TestBed.inject(Title).getTitle()).toContain('Python for Beginners');
  });

  it('sets a not-found document title on a 404', async () => {
    await navigate('/courses/does-not-exist');
    await flushCourse(null, 'does-not-exist', 404);
    await flushCategories();

    expect(TestBed.inject(Title).getTitle()).toContain('Course not found');
  });
});
