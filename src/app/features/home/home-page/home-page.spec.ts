import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthService } from '../../../core/auth/auth.service';
import { buildTestAccessToken } from '../../../core/auth/testing/test-jwt';
import { TranslationService } from '../../../core/i18n/translation.service';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CourseSearchResultItem, SearchCoursesResponse } from '../../catalog/data/course-api.models';
import { BannerItem } from '../../cms/data/cms-api.models';
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

const BANNERS: readonly BannerItem[] = [
  {
    id: 'b-1',
    title: 'Mid-Year Mega Sale ลด 50%',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3',
    targetUrl: '/courses',
    sortOrder: 1,
    isActive: true,
    startsAtUtc: null,
    endsAtUtc: null,
    createdAtUtc: '2026-08-01T00:00:00Z',
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
  let auth: AuthService;

  beforeEach(async () => {
    accessTokenStore.set(null);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: HomePage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    auth = TestBed.inject(AuthService);
    // The session restore (app initializer) has finished: whoever is browsing is now known.
    auth.isInitialized.set(true);
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    accessTokenStore.set(null);
  });

  async function settle(): Promise<void> {
    const flashRequests = httpMock.match((r) => r.url.includes('/api/commerce/flash-sales'));
    for (const req of flashRequests) {
      req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 });
    }
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

  function flushBanners(banners: readonly BannerItem[] = []): Promise<void> {
    const reqs = httpMock.match((r) => r.url === '/api/cms/banners');
    for (const req of reqs) {
      req.flush(banners);
    }
    return settle();
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

  it('sets canonical/OG for "/" on construction, with no JSON-LD', async () => {
    await navigate();

    const document = TestBed.inject(DOCUMENT);
    const origin = document.location.origin;
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${origin}/`);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${origin}/`);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('SIRI UpSkill');
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);

    await flushBanners();
    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('always renders the hero, even before any fetch resolves, with register/login CTAs for a guest', async () => {
    await navigate();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Learn new skills. Grow your career.');
    expect(harness.routeNativeElement?.querySelector('a[href="/register"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/login"]')).not.toBeNull();

    await flushBanners();
    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('shows neither the guest nor the signed-in CTAs until the session restore has finished', async () => {
    auth.isInitialized.set(false);
    await navigate();

    expect(harness.routeNativeElement?.querySelector('a[href="/register"]')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/login"]')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/my-courses"]')).toBeNull();

    await flushBanners();
    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('never offers register/login to a signed-in visitor, only browse and my-courses', async () => {
    accessTokenStore.set(buildTestAccessToken({ userId: 'user-home-1' }));
    await navigate();
    httpMock.match((r) => r.url === '/api/identity/me').forEach((req) =>
      req.flush({ id: 'user-home-1', email: 'a@example.test', displayName: 'Anna', avatarUrl: null, roles: ['Learner'] }),
    );
    httpMock.match((r) => r.url.startsWith('/api/learning')).forEach((req) => req.flush({ items: [] }));
    httpMock.match((r) => r.url === '/api/catalog/wishlist').forEach((req) => req.flush([]));
    await settle();

    expect(harness.routeNativeElement?.querySelector('a[href="/register"]')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/login"]')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/courses"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/my-courses"]')).not.toBeNull();

    await flushBanners();
    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('renders promotional CMS banner if present', async () => {
    await navigate();
    await flushBanners(BANNERS);
    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);

    const bannerSection = harness.routeNativeElement?.querySelector('section[aria-label="Promotional Banners"]');
    expect(bannerSection).not.toBeNull();
    expect(bannerSection?.textContent).toContain('Mid-Year Mega Sale ลด 50%');
  });

  it('shows busy skeletons for all three sections while loading', async () => {
    await navigate();

    expect(harness.routeNativeElement?.querySelectorAll('[aria-busy="true"]').length).toBe(3);

    await flushBanners();
    await flushCategories();
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);
  });

  it('renders category cards linking to /courses?category=<slug> once loaded', async () => {
    await navigate();
    await flushBanners();
    await flushCategories(CATEGORIES);
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);

    const link = harness.routeNativeElement?.querySelector('a[href="/courses?category=programming-technology"]');
    expect(link?.textContent).toContain('Programming & Technology');
  });

  it('renders recommended and newest course cards with correct "view all" links', async () => {
    await navigate();
    await flushBanners();
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
    await flushBanners();
    await flushCategories([]);
    await flushSearches(EMPTY_RESPONSE, EMPTY_RESPONSE);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).not.toContain('Browse by category');
    expect(text).not.toContain('Recommended courses');
    expect(text).not.toContain('Newest courses');
  });

  it('still renders the rest of the page when the categories fetch fails (section silently omitted)', async () => {
    await navigate();
    await flushBanners();
    await failCategories();
    await flushSearches(searchResponse([courseItem('rec-1', 'Top Rated Course')]), EMPTY_RESPONSE);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Learn new skills. Grow your career.');
    expect(text).toContain('Top Rated Course');
    expect(text).not.toContain('Browse by category');
  });
});
