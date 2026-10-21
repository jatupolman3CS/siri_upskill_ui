import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type {
  PublicSubjectItem,
  TutorSearchFacets,
  TutorSearchItem,
  TutorSearchResponse,
} from '../../data/tutoring-public.models';
import { TutorsPage } from './tutors-page';

function tutor(slug: string, name: string, extra: Partial<TutorSearchItem> = {}): TutorSearchItem {
  return {
    slug,
    displayName: name,
    headline: `${name} headline`,
    photoUrl: null,
    gender: 'Female',
    yearsExperience: 5,
    ratingAverage: 4.5,
    ratingCount: 12,
    completedSessionsCount: 80,
    subjects: [{ slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics' }],
    levels: ['UpperSecondary'],
    curricula: ['Thai'],
    fromHourlyRate: 450,
    hasGroup: false,
    hasTrial: false,
    hasFreeTrial: false,
    nextAvailableAtUtc: null,
    ...extra,
  };
}

const FACETS: TutorSearchFacets = {
  subjects: [],
  levels: [{ level: 'Adult', count: 7 }],
  curricula: [],
  genders: [],
  formats: [],
  trialCount: 0,
  hourlyRate: null,
};

function response(items: TutorSearchItem[], overrides: Partial<TutorSearchResponse> = {}, totalPages = 1): TutorSearchResponse {
  return {
    results: { items, totalCount: items.length, page: 1, pageSize: 12, totalPages },
    facets: FACETS,
    ...overrides,
  };
}

const SUBJECTS: PublicSubjectItem[] = [{ subjectId: 'sub-physics', slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentSlug: null, sortOrder: 0 }];

describe('TutorsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'tutors', component: TutorsPage }]),
        // withFetch() + the real error interceptor, as in app.config.ts.
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  /** See CoursesPage's spec: `flushEffects` starts the request an effect schedules, the microtask yield lets a
   *  flushed response reach the resource signal. */
  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  const macrotaskTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const isSearch = (req: { url: string }): boolean => req.url === '/api/tutoring/tutors';

  async function navigate(url: string): Promise<void> {
    await harness.navigateByUrl(url, TutorsPage);
    await settle();
  }

  async function flushSubjects(items: PublicSubjectItem[] = SUBJECTS): Promise<void> {
    httpMock.expectOne((req) => req.url === '/api/tutoring/subjects').flush({ items, totalCount: items.length, page: 1, pageSize: 200, totalPages: 1 });
    await settle();
  }

  async function flushSearch(body: TutorSearchResponse): Promise<void> {
    httpMock.expectOne(isSearch).flush(body);
    await settle();
  }

  async function failSearch(status: number, reason?: string): Promise<void> {
    httpMock.expectOne(isSearch).flush({ title: 'Problem', errorCode: 'validation', reason }, { status, statusText: 'Error' });
    await settle();
  }

  async function load(url: string, body: TutorSearchResponse): Promise<void> {
    await navigate(url);
    await flushSubjects();
    await flushSearch(body);
  }

  const buttonByText = (text: string): HTMLButtonElement =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

  it('shows a busy skeleton (no results, no empty state) while the search is loading', async () => {
    await navigate('/tutors');
    expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(root().textContent).not.toContain('No tutors match');

    await flushSubjects();
    await flushSearch(response([]));
  });

  it('renders one card per tutor, each linking to the profile, with the result count', async () => {
    await load('/tutors', response([tutor('nina-tutor', 'Nina Tutor'), tutor('arm-tutor', 'Arm Tutor')]));

    expect(root().querySelector('[aria-busy="true"]')).toBeNull();
    expect(root().textContent).toContain('2 tutors found');
    expect(Array.from(root().querySelectorAll('app-tutor-card a')).map((a) => a.getAttribute('href'))).toEqual([
      '/tutors/nina-tutor',
      '/tutors/arm-tutor',
    ]);
  });

  it('asks for page 1 with facets and the page size when the URL is bare', async () => {
    await navigate('/tutors');
    await flushSubjects();
    const req = httpMock.expectOne(isSearch);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('12');
    expect(req.request.params.get('facets')).toBe('true');
    req.flush(response([]));
    await settle();
  });

  it('maps every filter, the sort and the page from the URL onto the request, and skips facets after page 1', async () => {
    await navigate('/tutors?q=physics&subject=physics&level=Adult&curriculum=EP&format=Group&priceMin=200&priceMax=800&gender=Female&day=0&from=09:00&to=12:00&sort=nextAvailable&page=2');
    await flushSubjects();
    const params = httpMock.expectOne(isSearch);
    const get = (name: string): string | null => params.request.params.get(name);

    expect(get('q')).toBe('physics');
    expect(get('subject')).toBe('physics');
    expect(get('level')).toBe('Adult');
    expect(get('curriculum')).toBe('EP');
    expect(get('format')).toBe('Group');
    expect(get('priceMin')).toBe('200');
    expect(get('priceMax')).toBe('800');
    expect(get('gender')).toBe('Female');
    expect(get('day')).toBe('0');
    expect(get('from')).toBe('09:00');
    expect(get('to')).toBe('12:00');
    expect(get('sort')).toBe('nextAvailable');
    expect(get('page')).toBe('2');
    expect(get('facets')).toBe('false');
    params.flush(response([], { facets: null }));
    await settle();
  });

  it('shows the empty state with a clear-filters action only when a filter is active', async () => {
    await load('/tutors?level=Adult', response([]));
    expect(root().textContent).toContain('No tutors match your search');
    expect(buttonByText('Clear all filters')).toBeTruthy();

    await router.navigateByUrl('/tutors');
    await macrotaskTick();
    await settle();
    await flushSearch(response([]));
    // Both the sidebar and the empty state offer "clear" only when there is something to clear.
    expect(Array.from(root().querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Clear all filters')).toBe(false);
    expect(root().textContent).toContain('No tutors match your search');
  });

  it('clears every filter with one action', async () => {
    await load('/tutors?level=Adult&q=math&sort=rating', response([]));
    buttonByText('Clear all filters').click();
    await macrotaskTick();
    await settle();

    expect(router.url).toBe('/tutors');
    await flushSearch(response([]));
  });

  it('shows the mapped message with retry when the search fails, and retry fires the request again', async () => {
    await navigate('/tutors');
    await flushSubjects();
    await failSearch(500);

    expect(root().textContent).toContain('Could not load tutors');
    expect(root().textContent).toContain('Something went wrong. Please try again.');
    expect(root().textContent).not.toContain('No tutors match');

    buttonByText('Try again').click();
    await settle();
    await flushSearch(response([tutor('nina-tutor', 'Nina Tutor')]));
    expect(root().textContent).toContain('Nina Tutor');
  });

  it('explains an invalid-filter 400 in the user language and offers to clear the filters', async () => {
    await navigate('/tutors?priceMin=500&priceMax=100');
    await flushSubjects();
    await failSearch(400, 'tutoring.search_invalid');

    expect(root().textContent).toContain('Some filters are not valid');
    expect(buttonByText('Clear all filters')).toBeTruthy();
  });

  it('still renders results when the subject list fails to load', async () => {
    await navigate('/tutors');
    httpMock.expectOne((req) => req.url === '/api/tutoring/subjects').flush({ title: 'down' }, { status: 500, statusText: 'Error' });
    await settle();
    await flushSearch(response([tutor('nina-tutor', 'Nina Tutor')]));

    expect(root().textContent).toContain('Nina Tutor');
  });

  it('puts a changed filter in the URL, drops the page, and searches again', async () => {
    await load('/tutors?page=3&sort=rating', response([tutor('nina-tutor', 'Nina Tutor')], {}, 5));

    const level = Array.from(root().querySelectorAll('label')).find((l) => l.textContent?.trim() === 'Level')!;
    const select = root().querySelector<HTMLSelectElement>(`#${level.getAttribute('for')}`)!;
    select.value = 'Adult';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await macrotaskTick();
    await settle();

    expect(router.url).toBe('/tutors?sort=rating&level=Adult');
    const req = httpMock.expectOne(isSearch);
    expect(req.request.params.get('level')).toBe('Adult');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(response([]));
    await settle();
  });

  it('submits the search text into the URL and resets the page', async () => {
    await load('/tutors?page=2', response([tutor('nina-tutor', 'Nina Tutor')], {}, 3));

    const input = root().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = '  chemistry ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    root().querySelector<HTMLFormElement>('form[role="search"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await macrotaskTick();
    await settle();

    expect(router.url).toBe('/tutors?q=chemistry');
    await flushSearch(response([]));
  });

  it('changes the sort through the URL, and drops the default sort from it again', async () => {
    await load('/tutors', response([tutor('nina-tutor', 'Nina Tutor')]));

    const sort = Array.from(root().querySelectorAll('label')).find((l) => l.textContent?.trim() === 'Sort by')!;
    const select = root().querySelector<HTMLSelectElement>(`#${sort.getAttribute('for')}`)!;
    select.value = 'priceDesc';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await macrotaskTick();
    await settle();
    expect(router.url).toBe('/tutors?sort=priceDesc');
    await flushSearch(response([]));

    select.value = 'relevance';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await macrotaskTick();
    await settle();
    expect(router.url).toBe('/tutors');
    await flushSearch(response([]));
  });

  it('pages through the URL', async () => {
    await load('/tutors?level=Adult', response([tutor('nina-tutor', 'Nina Tutor')], {}, 4));

    const next = Array.from(root().querySelectorAll('button')).find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('next'));
    next?.click();
    await macrotaskTick();
    await settle();

    expect(router.url).toBe('/tutors?level=Adult&page=2');
    const req = httpMock.expectOne(isSearch);
    expect(req.request.params.get('facets')).toBe('false');
    req.flush(response([], { facets: null }, 4));
    await settle();
  });

  it('keeps the previous facet counts while a later page (which carries no facets) loads', async () => {
    await load('/tutors', response([tutor('nina-tutor', 'Nina Tutor')], {}, 3));
    const levelOptions = (): string[] => {
      const label = Array.from(root().querySelectorAll('label')).find((l) => l.textContent?.trim() === 'Level')!;
      return Array.from(root().querySelector<HTMLSelectElement>(`#${label.getAttribute('for')}`)!.options).map((o) => o.textContent?.trim() ?? '');
    };
    expect(levelOptions()).toContain('Adult / professional (7)');

    await router.navigateByUrl('/tutors?page=2');
    await macrotaskTick();
    await settle();
    await flushSearch(response([tutor('arm-tutor', 'Arm Tutor')], { facets: null }, 3));

    expect(levelOptions()).toContain('Adult / professional (7)');
  });

  it('collapses the filter panel behind a toggle on small screens and shows how many filters are active', async () => {
    await load('/tutors?level=Adult&gender=Female', response([]));
    const toggle = root().querySelector<HTMLButtonElement>('button[aria-controls="tutor-filters-panel"]')!;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('2 active');
    toggle.click();
    harness.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the canonical on the bare /tutors whatever the filters, and sets the title and description', async () => {
    await load('/tutors?level=Adult&page=2&q=math', response([]));
    const doc = TestBed.inject(DOCUMENT);

    expect(doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${doc.location.origin}/tutors`);
    expect(TestBed.inject(Title).getTitle()).toBe('Find a tutor | SIRI UpSkill');
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('identity-verified tutors');
    // Filtered variants stay indexable-by-canonical, not noindex: noindex plus a canonical elsewhere would contradict itself.
    expect(doc.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
