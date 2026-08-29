import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { SearchCoursesResponse } from '../data/course-api.models';
import { CoursesPage } from './courses-page';

const CATEGORIES = [
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

const ONE_COURSE_RESPONSE: SearchCoursesResponse = {
  results: {
    items: [
      {
        id: 'course-1',
        slug: 'python-for-beginners',
        title: 'Python for Beginners',
        subtitle: null,
        thumbnailUrl: null,
        price: 990,
        comparePrice: 1990,
        currency: 'THB',
        level: 'Beginner',
        language: 'Thai',
        ratingAverage: 4.5,
        ratingCount: 10,
        enrollmentCount: 100,
        episodeCount: 4,
        totalDurationSeconds: 3600,
        instructorId: 'instructor-1',
        instructorDisplayName: 'ธนกฤต ศรีสุวรรณ',
        categoryId: 'cat-programming',
      },
    ],
    totalCount: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  },
  facets: {
    categories: [{ categoryId: 'cat-programming', count: 1 }],
    levels: [{ level: 'Beginner', count: 1 }],
    instructors: [{ instructorId: 'instructor-1', displayName: 'ธนกฤต ศรีสุวรรณ', count: 1 }],
  },
};

const EMPTY_RESPONSE: SearchCoursesResponse = {
  results: { items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 },
  facets: { categories: [], levels: [], instructors: [] },
};

describe('CoursesPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'courses', component: CoursesPage }]),
        // withFetch() — matches app.config.ts's real HTTP client setup, not just provideHttpClient()'s
        // plain XHR default (see CourseDetailPage's own spec for why this isn't just cosmetic).
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  /** Two distinct settling needs, both real, both discovered empirically while writing these tests:
   * `flushEffects()` *synchronously* runs whatever `rxResource`'s own internal effect schedules in
   * reaction to a signal write (starting a new HTTP call) — without it, the next `httpMock.expectOne`
   * for a request that should have just been triggered flakily finds nothing (a real race, not
   * consistently reproducible, worse under the full suite's load than in isolation). The `await
   * Promise.resolve()` micro-yield is the *other* direction: `HttpTestingController`'s own `.flush()`
   * resolves the underlying Observable synchronously, but propagating that into `rxResource`'s `.value()`
   * signal needs an actual microtask turn — `detectChanges()` immediately after `.flush()` alone
   * observed the resource still mid-transition often enough to be worth this instead of chancing it. */
  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function flushCategories(categories: readonly unknown[] = CATEGORIES): Promise<void> {
    httpMock.expectOne((req) => req.url === '/api/catalog/categories').flush(categories);
    await settle();
  }

  /** Regression coverage for the crash reported against a real backend outage: `categoriesResource`
   *  only has a `defaultValue`, which does NOT make `.value()` safe to read once the resource has
   *  genuinely settled into an error state (throws there regardless — see `CourseDetailPage`'s own doc
   *  comment for where this was first discovered). Before `categories()`'s `hasValue()` guard existed,
   *  this crashed both the sidebar category list and `categoryId`/`activeCategory`. */
  async function failCategories(): Promise<void> {
    httpMock.expectOne((req) => req.url === '/api/catalog/categories').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await settle();
  }

  async function flushSearch(response: SearchCoursesResponse = EMPTY_RESPONSE): Promise<void> {
    httpMock.expectOne((req) => req.url === '/api/catalog/courses/search').flush(response);
    await settle();
  }

  /** Same regression class as `failCategories()`, but for `courseSearchResource` — this page's primary
   *  content, unlike the categories sidebar filter, so it gets a dedicated error branch (with a retry
   *  action) rather than silently collapsing into "zero results". */
  async function failSearch(): Promise<void> {
    httpMock.expectOne((req) => req.url === '/api/catalog/courses/search').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await settle();
  }

  async function navigate(url: string): Promise<CoursesPage> {
    const component = await harness.navigateByUrl(url, CoursesPage);
    await settle();
    return component;
  }

  /** `router.navigate(...)` (called fire-and-forget, `void`-prefixed, from `updateQueryParams` — a
   * deliberate choice in real code, this URL-sync side effect has nothing meaningful to do with its own
   * completion) resolves through the Router's own internal RxJS pipeline, which one microtask turn
   * (`settle()`'s `Promise.resolve()`) isn't reliably enough to drain — a real macrotask tick is.
   * Awaiting full app stability instead (`fixture.whenStable()`) was tried first and rejected: Angular's
   * Router registers navigation as a pending task the same way an in-flight `rxResource` fetch is, so
   * stability would also wait for the *new* search request this navigation triggers — exactly the
   * request tests here need to inspect before flushing. */
  function macrotaskTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('shows a skeleton (no results grid, no empty state) while the search is still loading', async () => {
    await navigate('/courses');

    expect(harness.routeNativeElement?.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('No courses match your filters');

    await flushCategories([]);
    await flushSearch();
  });

  it('shows the empty state with a clear-filters action once loaded with zero results and an active filter', async () => {
    await navigate('/courses?q=nonexistent');
    await flushCategories([]);
    await flushSearch(EMPTY_RESPONSE);

    expect(harness.routeNativeElement?.textContent).toContain('No courses match your filters');
    expect(harness.routeNativeElement?.querySelector('[aria-busy="true"]')).toBeNull();
    const clearButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Clear all filters',
    );
    expect(clearButton).toBeTruthy();
  });

  it('renders a course card linking to /courses/{slug} once loaded with results', async () => {
    await navigate('/courses');
    await flushCategories([]);
    await flushSearch(ONE_COURSE_RESPONSE);

    const link = harness.routeNativeElement?.querySelector('a[href="/courses/python-for-beginners"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Python for Beginners');
  });

  it('resolves ?category=<slug> to the matching categoryId before firing the search request', async () => {
    await navigate('/courses?category=programming-technology');

    // The search request must not exist yet — categoriesResource hasn't resolved, so the category
    // slug can't be turned into an id yet (this is the "skip fetch until categories loaded" behavior
    // this class's own doc comment describes).
    httpMock.expectNone((req) => req.url === '/api/catalog/courses/search');

    await flushCategories(CATEGORIES);

    const searchRequest = httpMock.expectOne((req) => req.url === '/api/catalog/courses/search');
    expect(searchRequest.request.params.get('categoryId')).toBe('cat-programming');
    searchRequest.flush(ONE_COURSE_RESPONSE);
    await settle();
  });

  it('applying the level filter navigates with the level query param and resets the page to unset', async () => {
    await navigate('/courses?level=Advanced&page=3');
    await flushCategories([]);
    await flushSearch();

    // Drives the same protected members the level <app-select>'s (change) handler calls — see
    // category-mega-menu.spec.ts / mobile-nav.spec.ts for why every other spec in this codebase tests
    // through rendered DOM instead; this one direct exception is because dispatching a native `change`
    // event at the inner <select> proved unreliable to observe bubbling to <app-select>'s own (change)
    // binding under this project's zoneless test harness, and CoursesPage's actual URL-sync behavior
    // (the thing worth verifying here) lives entirely in updateQueryParams, not in that DOM plumbing.
    const internals = harness.routeDebugElement!.componentInstance as unknown as {
      readonly levelControl: { setValue(value: string): void };
      applyLevelFilter(): void;
    };
    internals.levelControl.setValue('Beginner');
    internals.applyLevelFilter();
    await macrotaskTick();
    await settle();

    expect(router.url).toContain('level=Beginner');
    expect(router.url).not.toContain('page=');

    // Changing the filter immediately re-fires the search (a new level/page combination) — flush it so
    // this test doesn't leave a pending request behind for the next test's httpMock.verify() to trip on.
    await flushSearch();
  });

  it('clearAllFilters navigates to a URL with no query params at all', async () => {
    await navigate('/courses?level=Beginner&q=python');
    await flushCategories([]);
    await flushSearch();

    const clearButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Clear all filters',
    ) as HTMLButtonElement;
    clearButton.click();
    await macrotaskTick();
    await settle();

    expect(router.url).toBe('/courses');

    await flushSearch();
  });

  it('still renders the page (with an empty category sidebar) when the categories fetch fails, instead of crashing', async () => {
    await navigate('/courses');
    await failCategories();
    await flushSearch(ONE_COURSE_RESPONSE);

    expect(harness.routeNativeElement?.querySelector('a[href="/courses/python-for-beginners"]')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Python for Beginners');
  });

  it('shows an error state with a retry action when the course search fails, and retry re-fires the request', async () => {
    await navigate('/courses');
    await flushCategories([]);
    await failSearch();

    expect(harness.routeNativeElement?.textContent).toContain("Couldn't load courses");
    const retryButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Try again',
    ) as HTMLButtonElement;
    expect(retryButton).toBeTruthy();

    retryButton.click();
    await settle();

    const retryRequest = httpMock.expectOne((req) => req.url === '/api/catalog/courses/search');
    retryRequest.flush(EMPTY_RESPONSE);
    await settle();

    expect(harness.routeNativeElement?.textContent).toContain('No courses match your filters');
  });

  it('renders instructor facet and filters by instructorId when clicked', async () => {
    await navigate('/courses');
    await flushCategories([]);
    await flushSearch(ONE_COURSE_RESPONSE);

    expect(harness.routeNativeElement?.textContent).toContain('ธนกฤต ศรีสุวรรณ');

    const instructorButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('ธนกฤต ศรีสุวรรณ'),
    ) as HTMLButtonElement;
    expect(instructorButton).toBeTruthy();

    instructorButton.click();
    await macrotaskTick();
    await settle();

    expect(router.url).toContain('instructorId=instructor-1');

    const searchRequest = httpMock.expectOne((req) => req.url === '/api/catalog/courses/search');
    expect(searchRequest.request.params.get('instructorId')).toBe('instructor-1');
    searchRequest.flush(ONE_COURSE_RESPONSE);
    await settle();
  });
});
