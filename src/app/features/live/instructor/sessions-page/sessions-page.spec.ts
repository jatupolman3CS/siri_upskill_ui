import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import type { PagedResult } from '../../../../core/http/paged-result.model';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { InstructorMeetingSummary, InstructorSessionListItem } from '../../data/live-instructor.models';
import { SessionsPage } from './sessions-page';

registerLocaleData(localeTh);

const meeting = (overrides: Partial<InstructorMeetingSummary> = {}): InstructorMeetingSummary => ({
  sessionId: 's1',
  provider: 'GoogleMeet',
  syncStatus: 'Synced',
  hasMeetingLink: true,
  isUsable: true,
  lastSyncAtUtc: null,
  needsAction: 'None',
  errorCode: null,
  ...overrides,
});

const item = (overrides: Partial<InstructorSessionListItem> = {}): InstructorSessionListItem => ({
  sessionId: 's1',
  courseId: 'c1',
  courseTitle: 'Excel Pro',
  title: 'Session 1: basics',
  startsAtUtc: '2026-10-08T03:00:00Z',
  endsAtUtc: '2026-10-08T05:00:00Z',
  displayState: 'Upcoming',
  expectedLearners: 12,
  joinedLearners: 0,
  meeting: meeting(),
  recordingEpisodeId: null,
  cancelReason: null,
  ...overrides,
});

const page = (items: InstructorSessionListItem[], extra: Partial<PagedResult<InstructorSessionListItem>> = {}) => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  ...extra,
});

describe('SessionsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/sessions', component: SessionsPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
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

  /** One macrotask: lets a fire-and-forget `router.navigate()` finish. (Not `whenStable()` — that would wait on the very
   *  HTTP request the navigation just triggered, which this test only flushes afterwards.) */
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  async function open(url = '/instructor/sessions'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, SessionsPage);
    await settle();
  }

  async function flushList(body: ReturnType<typeof page>): Promise<void> {
    httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions').flush(body);
    await settle();
  }

  const root = () => harness.routeNativeElement as HTMLElement;

  it('requests the upcoming scope by default and renders each session with state, room status and attendance', async () => {
    await open();
    const req = httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions');
    expect(req.request.params.get('scope')).toBe('upcoming');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([item(), item({ sessionId: 's2', title: 'Session 2', meeting: meeting({ needsAction: 'PasteLink', syncStatus: 'AwaitingLink', hasMeetingLink: false, isUsable: false }) })]));
    await settle();

    const text = root().textContent ?? '';
    expect(text).toContain('Session 1: basics');
    expect(text).toContain('Excel Pro');
    expect(text).toContain('Upcoming');
    expect(text).toContain('Room ready');
    expect(text).toContain('Waiting for link');
    expect(text).toContain('0 of 12 invited learners joined');
    // 03:00Z is 10:00 in Bangkok, whatever the machine's own zone
    expect(text).toContain('10:00–12:00');
    expect(text).toContain('Thailand time');
    const links = Array.from(root().querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/instructor/sessions/s1');
  });

  it('a cancelled session shows its reason and no room status', async () => {
    await open('/instructor/sessions?scope=all');
    await flushList(page([item({ displayState: 'Cancelled', cancelReason: 'Instructor ill', meeting: meeting({ needsAction: 'Retry', syncStatus: 'Failed' }) })]));

    const text = root().textContent ?? '';
    expect(text).toContain('Cancelled');
    expect(text).toContain('Instructor ill');
    expect(text).not.toContain('Room creation failed');
  });

  it('the scope comes from the URL, and choosing a tab updates the URL and refetches from page 1', async () => {
    await open('/instructor/sessions?scope=past&page=3');
    const first = httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions');
    expect(first.request.params.get('scope')).toBe('past');
    expect(first.request.params.get('page')).toBe('3');
    first.flush(page([item({ displayState: 'Ended' })], { page: 3, totalPages: 4, totalCount: 70 }));
    await settle();

    const allTab = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'All') as HTMLButtonElement;
    allTab.click();
    await tick();
    await settle();

    expect(router.url).toBe('/instructor/sessions?scope=all');
    const second = httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions');
    expect(second.request.params.get('scope')).toBe('all');
    expect(second.request.params.get('page')).toBe('1');
    second.flush(page([]));
    await settle();
  });

  it('an unknown scope value in the URL falls back to upcoming', async () => {
    await open('/instructor/sessions?scope=bogus');
    const req = httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions');
    expect(req.request.params.get('scope')).toBe('upcoming');
    req.flush(page([]));
    await settle();
  });

  it('shows an empty state that points to the courses when there are no sessions', async () => {
    await open();
    await flushList(page([]));

    expect(root().textContent).toContain('No live sessions yet');
    expect(Array.from(root().querySelectorAll('a')).some((a) => a.getAttribute('href') === '/instructor/courses')).toBe(true);
  });

  it('shows an error state with retry when the list cannot be loaded', async () => {
    await open();
    httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions').flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(root().textContent).toContain('Could not load your live sessions');

    (Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Try again')) as HTMLButtonElement).click();
    await settle();
    await flushList(page([item()]));
    expect(root().textContent).toContain('Session 1: basics');
  });

  it('paginates through the URL when there is more than one page', async () => {
    await open();
    await flushList(page([item()], { totalCount: 45, totalPages: 3 }));

    const next = Array.from(root().querySelectorAll('button')).find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('next')) as HTMLButtonElement;
    expect(next).toBeDefined();
    next.click();
    await tick();
    await settle();

    expect(router.url).toContain('page=2');
    const req = httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions');
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([item()], { page: 2, totalCount: 45, totalPages: 3 }));
    await settle();
  });
});
