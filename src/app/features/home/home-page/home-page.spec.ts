import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CourseSearchResultItem, SearchCoursesResponse } from '../../catalog/data/course-api.models';
import { HomePage } from './home-page';

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

function courseItem(id: string, title: string): CourseSearchResultItem {
  return {
    id,
    slug: id,
    title,
    subtitle: null,
    thumbnailUrl: null,
    price: 990,
    comparePrice: null,
    currency: 'THB',
    level: 'Beginner',
    language: 'Thai',
    ratingAverage: 0,
    ratingCount: 0,
    enrollmentCount: 0,
    episodeCount: 3,
    totalDurationSeconds: 3600,
    instructorId: 'instructor-1',
    instructorDisplayName: 'ธนกฤต ศรีสุวรรณ',
    categoryId: 'cat-programming',
  };
}

function searchResponse(items: readonly CourseSearchResultItem[]): SearchCoursesResponse {
  return {
    results: { items, totalCount: items.length, page: 1, pageSize: 4, totalPages: 1 },
    facets: { categories: [], levels: [] },
  };
}

const EMPTY_RESPONSE = searchResponse([]);

describe('HomePage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: HomePage }]),
        // withFetch() — matches app.config.ts's real HTTP client (see CourseDetailPage's own spec for
        // why this isn't just cosmetic).
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

  async function navigate(): Promise<HomePage> {
    const component = await harness.navigateByUrl('/', HomePage);
    await settle();
    return component;
  }

  function flushCategories(categories: readonly CategoryTreeNode[] = []): Promise<void> {
    httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush(categories);
    return settle();
  }

  function failCategories(): Promise<void> {
    httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    return settle();
  }

  function flushSearches(recommended: SearchCoursesResponse, newest: SearchCoursesResponse): Promise<void> {
    const requests = httpMock.match((r) => r.url === '/api/catalog/courses/search');
    expect(requests.length).toBe(2);
    for (const req of requests) {
      if (req.request.params.get('sort') === 'RatingDesc') {
        req.flush(recommended);
      } else if (req.request.params.get('sort') === 'Newest') {
        req.flush(newest);
      } else {
        throw new Error(`Unexpected sort param: ${req.request.params.get('sort')}`);
      }
    }
    return settle();
  }

  it('sets canonical/OG for "/" on construction, with no JSON-LD (no Course/BreadcrumbList schema applies to a landing page)', async () => {
    await navigate();

    const document = TestBed.inject(DOCUMENT);
    const origin = document.location.origin;
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${origin}/`);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${origin}/`);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('SIRI UpSkill');
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);

    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('always renders the hero, even before any fetch resolves', async () => {
    await navigate();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Learn new skills. Grow your career.');
    expect(harness.routeNativeElement?.querySelector('a[href="/register"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/login"]')).not.toBeNull();

    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('shows busy skeletons for all three sections while loading', async () => {
    await navigate();

    expect(harness.routeNativeElement?.querySelectorAll('[aria-busy="true"]').length).toBe(3);

    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('renders category cards linking to /courses?category=<slug> once loaded', async () => {
    await navigate();
    await flushCategories(CATEGORIES);
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);

    const link = harness.routeNativeElement?.querySelector('a[href="/courses?category=programming-technology"]');
    expect(link?.textContent).toContain('Programming & Technology');
  });

  it('renders recommended and newest course cards with correct "view all" links', async () => {
    await navigate();
    await flushCategories();
    await flushSearches(searchResponse([courseItem('rec-1', 'Top Rated Course')]), searchResponse([courseItem('new-1', 'Brand New Course')]));

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Top Rated Course');
    expect(text).toContain('Brand New Course');

    expect(harness.routeNativeElement?.querySelector('a[href="/courses/rec-1"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/courses/new-1"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/courses?sort=RatingDesc"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/courses?sort=Newest"]')).not.toBeNull();
  });

  it('omits a section entirely once it settles with zero results, instead of showing an empty heading', async () => {
    await navigate();
    await flushCategories([]);
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).not.toContain('Browse by category');
    expect(text).not.toContain('Recommended courses');
    expect(text).not.toContain('Newest courses');
  });

  it('still renders the rest of the page when the categories fetch fails (section silently omitted)', async () => {
    await navigate();
    await failCategories();
    await flushSearches(searchResponse([courseItem('rec-1', 'Top Rated Course')]), EMPTY_RESPONSE);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Learn new skills. Grow your career.');
    expect(text).toContain('Top Rated Course');
    expect(text).not.toContain('Browse by category');
  });
});
