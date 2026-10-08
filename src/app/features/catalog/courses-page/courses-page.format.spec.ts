import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import type { CourseSearchResultItem, SearchCoursesResponse } from '../data/course-api.models';
import { CoursesPage } from './courses-page';
import { parseDeliveryFormat } from './course-format-filter/course-format-filter';

registerLocaleData(localeTh);

function item(overrides: Partial<CourseSearchResultItem> = {}): CourseSearchResultItem {
  return {
    id: 'c1',
    slug: 'excel-pro',
    title: 'Excel Pro',
    subtitle: null,
    thumbnailUrl: null,
    price: 1490,
    comparePrice: null,
    currency: 'THB',
    level: 'Beginner',
    language: 'Thai',
    ratingAverage: 0,
    ratingCount: 0,
    enrollmentCount: 0,
    episodeCount: 3,
    totalDurationSeconds: 3600,
    instructorId: 'i1',
    instructorDisplayName: 'Teacher',
    categoryId: 'cat',
    ...overrides,
  };
}

function response(items: CourseSearchResultItem[], formats?: SearchCoursesResponse['facets']['formats']): SearchCoursesResponse {
  return {
    results: { items, totalCount: items.length, page: 1, pageSize: 20, totalPages: 1 },
    facets: { categories: [], levels: [], instructors: [], formats },
  };
}

describe('CoursesPage — delivery format filter (P11-21)', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'courses', component: CoursesPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, CoursesPage);
    await settle();
  }

  async function flushCategories(): Promise<void> {
    httpMock.expectOne((r) => r.url === '/api/catalog/categories').flush([]);
    await settle();
  }

  const searchReq = () => httpMock.expectOne((r) => r.url === '/api/catalog/courses/search');
  const root = () => harness.routeNativeElement as HTMLElement;
  const formatButton = (label: string) =>
    Array.from(root().querySelectorAll('app-course-format-filter button')).find((b) =>
      b.textContent?.includes(label),
    ) as HTMLButtonElement;

  it('the URL is the single source of truth: ?format=Live is sent to the API and marks the option pressed', async () => {
    await open('/courses?format=Live');
    await flushCategories();
    const req = searchReq();
    expect(req.request.params.get('format')).toBe('Live');
    req.flush(response([item({ deliveryFormat: 'Live' })], [{ format: 'Live', count: 1 }]));
    await settle();

    expect(formatButton('Live').getAttribute('aria-pressed')).toBe('true');
    expect(formatButton('Self-paced').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows facet counts per format and disables a format with no matches', async () => {
    await open('/courses');
    await flushCategories();
    searchReq().flush(
      response([item()], [
        { format: 'OnDemand', count: 12 },
        { format: 'Live', count: 3 },
      ]),
    );
    await settle();

    expect(formatButton('Self-paced').textContent).toContain('(12)');
    expect(formatButton('Live').textContent).toContain('(3)');
    expect(formatButton('Hybrid').textContent).toContain('(0)');
    expect(formatButton('Hybrid').disabled).toBe(true);
    expect(formatButton('Live').disabled).toBe(false);
  });

  it('choosing a format writes it to the URL, resets the page and refetches; choosing it again clears it', async () => {
    await open('/courses?page=3');
    await flushCategories();
    const first = searchReq();
    expect(first.request.params.get('page')).toBe('3');
    first.flush(response([item()], [{ format: 'Live', count: 2 }, { format: 'OnDemand', count: 5 }]));
    await settle();

    formatButton('Live').click();
    await tick();
    await settle();
    expect(router.url).toBe('/courses?format=Live');
    const second = searchReq();
    expect(second.request.params.get('format')).toBe('Live');
    expect(second.request.params.get('page')).toBe('1'); // back to the first page
    second.flush(response([item({ deliveryFormat: 'Live' })], [{ format: 'Live', count: 2 }]));
    await settle();

    formatButton('Live').click();
    await tick();
    await settle();
    expect(router.url).toBe('/courses');
    searchReq().flush(response([item()]));
    await settle();
  });

  it('does not send a format the API does not know (hand-edited URL)', async () => {
    await open('/courses?format=bogus');
    await flushCategories();
    const req = searchReq();
    expect(req.request.params.has('format')).toBe(false);
    req.flush(response([]));
    await settle();
    expect(formatButton('Live').getAttribute('aria-pressed')).toBe('false');
  });

  it('cards of Live/Hybrid courses carry a text badge and the next session; on-demand cards have neither', async () => {
    await open('/courses');
    await flushCategories();
    searchReq().flush(
      response([
        item({ id: 'a', slug: 'a', title: 'Live course', deliveryFormat: 'Live', nextStartsAtUtc: '2026-10-09T03:00:00Z' }),
        item({ id: 'b', slug: 'b', title: 'Hybrid course', deliveryFormat: 'Hybrid', nextStartsAtUtc: null }),
        item({ id: 'c', slug: 'c', title: 'Video course', deliveryFormat: 'OnDemand' }),
        item({ id: 'd', slug: 'd', title: 'Legacy course' }),
      ]),
    );
    await settle();

    const cards = Array.from(root().querySelectorAll('a[href^="/courses/"]')) as HTMLAnchorElement[];
    const card = (title: string) => cards.find((c) => c.textContent?.includes(title)) as HTMLAnchorElement;
    expect(card('Live course').querySelector('app-course-format-badge')?.textContent).toContain('Live');
    expect(card('Live course').textContent).toContain('Next session: 9 Oct 10:00');
    expect(card('Hybrid course').querySelector('app-course-format-badge')?.textContent).toContain('Hybrid');
    expect(card('Hybrid course').textContent).not.toContain('Next session');
    expect(card('Video course').querySelector('app-course-format-badge')?.textContent?.trim()).toBe('');
    expect(card('Legacy course').querySelector('app-course-format-badge')?.textContent?.trim()).toBe('');
  });

  it('parseDeliveryFormat only accepts the three known formats', () => {
    expect(parseDeliveryFormat('Live')).toBe('Live');
    expect(parseDeliveryFormat('Hybrid')).toBe('Hybrid');
    expect(parseDeliveryFormat('OnDemand')).toBe('OnDemand');
    expect(parseDeliveryFormat('live')).toBeNull();
    expect(parseDeliveryFormat('')).toBeNull();
    expect(parseDeliveryFormat(null)).toBeNull();
  });

  it('keeps the format when another filter changes (merge), and "clear all" removes it', async () => {
    await open('/courses?format=Hybrid&level=Beginner');
    await flushCategories();
    searchReq().flush(response([item()], [{ format: 'Hybrid', count: 1 }]));
    await settle();
    expect(router.url).toContain('format=Hybrid');

    const clear = Array.from(root().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear all filters'),
    ) as HTMLButtonElement;
    expect(clear).toBeDefined();
    clear.click();
    await tick();
    await settle();
    expect(router.url).toBe('/courses');
    searchReq().flush(response([item()]));
    await settle();
  });
});
