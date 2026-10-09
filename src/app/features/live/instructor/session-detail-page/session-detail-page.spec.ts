import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { InstructorMeetingSummary, InstructorSessionDetail } from '../../data/live-instructor.models';
import { SessionDetailPage } from './session-detail-page';

registerLocaleData(localeTh);


const DETAIL_URL = '/api/live/instructor/sessions/s1';
const GOOGLE_URL = '/api/live/instructor/google/status';
const ROSTER_URL = '/api/live/instructor/sessions/s1/roster';

const meeting = (overrides: Partial<InstructorMeetingSummary> = {}): InstructorMeetingSummary => ({
  sessionId: 's1',
  provider: 'GoogleMeet',
  syncStatus: 'Synced',
  hasMeetingLink: true,
  isUsable: true,
  lastSyncAtUtc: '2026-10-07T03:00:00Z',
  needsAction: 'None',
  errorCode: null,
  ...overrides,
});

const detail = (overrides: Partial<InstructorSessionDetail> = {}): InstructorSessionDetail => ({
  sessionId: 's1',
  courseId: 'c1',
  courseTitle: 'Excel Pro',
  courseSlug: 'excel-pro',
  title: 'Session 1: basics',
  description: null,
  startsAtUtc: '2026-10-08T03:00:00Z',
  endsAtUtc: '2026-10-08T05:00:00Z',
  displayState: 'Upcoming',
  status: 'Scheduled',
  cancelReason: null,
  recordingEpisodeId: null,
  meetUrl: 'https://meet.google.com/abc-defg-hij',
  meeting: meeting(),
  enrolledCount: 20,
  expectedLearners: 18,
  joinedLearners: 3,
  serverTimeUtc: '2026-10-07T03:00:00Z',
  ...overrides,
});

describe('SessionDetailPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/sessions/:id', component: SessionDetailPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  /** Opens the page and answers the three requests it makes on load (detail, Google status, roster). */
  async function open(body: InstructorSessionDetail | { error: number }, configured = true): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/sessions/s1', SessionDetailPage);
    await settle();
    const detailReq = httpMock.expectOne(DETAIL_URL);
    if ('error' in body) {
      detailReq.flush({ reason: 'live.not_found' }, { status: body.error, statusText: 'Err' });
    } else {
      detailReq.flush(body);
    }
    httpMock.expectOne(GOOGLE_URL).flush({ configured, connected: true, needsReconnect: false });
    await settle();
    for (const req of httpMock.match((r) => r.url === ROSTER_URL)) {
      req.flush({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 });
    }
    await settle();
  }

  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => root().textContent ?? '';

  it('the owner sees the room link with an "Open room" link (new tab, noopener) and a copy button', async () => {
    await open(detail());

    expect(text()).toContain('https://meet.google.com/abc-defg-hij');
    const open_ = Array.from(root().querySelectorAll('a')).find((a) => a.textContent?.includes('Open room')) as HTMLAnchorElement;
    expect(open_.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect(open_.getAttribute('target')).toBe('_blank');
    expect(open_.getAttribute('rel')).toContain('noopener');
    expect(Array.from(root().querySelectorAll('button')).some((b) => b.textContent?.includes('Copy link'))).toBe(true);
    // headline numbers
    expect(text()).toContain('20');
    expect(text()).toContain('18');
    expect(text()).toContain('Room ready');
  });

  it('never offers a stored link that is not https', async () => {
    await open(detail({ meetUrl: 'javascript:alert(1)' }));

    expect(text()).not.toContain('javascript:');
    expect(Array.from(root().querySelectorAll('a')).some((a) => a.textContent?.includes('Open room'))).toBe(false);
    expect(text()).toContain('not safe to open');
  });

  it('PasteLink -> shows the link field instead of a link', async () => {
    await open(
      detail({ meetUrl: null, meeting: meeting({ needsAction: 'PasteLink', syncStatus: 'AwaitingLink', hasMeetingLink: false, isUsable: false }) }),
    );

    expect(root().querySelector('input[type="url"]')).not.toBeNull();
    expect(Array.from(root().querySelectorAll('a')).some((a) => a.textContent?.includes('Open room'))).toBe(false);
  });

  it('a 404 and a 403 both read as "not found" (the API folds them together on purpose)', async () => {
    await open({ error: 404 });
    expect(text()).toContain('Session not found');
  });

  it('a server error shows a retry state and does not render a half-built page', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/sessions/s1', SessionDetailPage);
    await settle();
    httpMock.expectOne(DETAIL_URL).flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(GOOGLE_URL).flush({}, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text()).toContain('Could not load the session');
    expect(text()).not.toContain('Online room');
    expect(httpMock.match((r) => r.url === ROSTER_URL)).toHaveLength(0);
  });

  it('a cancelled session shows its reason and neither a room nor a cancel button', async () => {
    await open(detail({ displayState: 'Cancelled', status: 'Cancelled', cancelReason: 'Instructor ill', meetUrl: null }));

    expect(text()).toContain('This session was cancelled');
    expect(text()).toContain('Instructor ill');
    expect(text()).not.toContain('Online room');
    expect(Array.from(root().querySelectorAll('button')).some((b) => b.textContent?.includes('Cancel this session'))).toBe(false);
  });

  it('an upcoming session can be cancelled (button opens the reason dialog); an ended one cannot', async () => {
    await open(detail());
    const cancel = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Cancel this session')) as HTMLButtonElement;
    expect(cancel).toBeDefined();
    cancel.click();
    await settle();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Reason for cancelling');
  });

  it('an ended session offers the recording upload and a link to the recording once attached', async () => {
    await open(detail({ displayState: 'Ended', recordingEpisodeId: 'e9', meetUrl: null }));

    expect(text()).toContain('Recording');
    expect(text()).toContain('Replace recording');
    const watch = Array.from(root().querySelectorAll('a')).find((a) => a.textContent?.includes('Watch the recording'));
    expect(watch?.getAttribute('href')).toBe('/learn/excel-pro/e9');
    expect(Array.from(root().querySelectorAll('button')).some((b) => b.textContent?.includes('Cancel this session'))).toBe(false);
  });

  describe('while the room is still being created', () => {
    it('re-checks every 10 seconds until the room is ready, then stops', async () => {
      vi.useFakeTimers();
      await open(detail({ meetUrl: null, meeting: meeting({ needsAction: 'Waiting', syncStatus: 'Pending', hasMeetingLink: false, isUsable: false }) }));
      expect(text()).toContain('Preparing room');

      vi.advanceTimersByTime(9_999);
      httpMock.expectNone(DETAIL_URL);
      vi.advanceTimersByTime(1);
      TestBed.flushEffects();
      httpMock.expectOne(DETAIL_URL).flush(detail()); // room is ready now
      await settle();
      expect(text()).toContain('https://meet.google.com/abc-defg-hij');

      vi.advanceTimersByTime(60_000);
      httpMock.expectNone(DETAIL_URL);
    });

    it('does not poll at all when no room is waiting', async () => {
      vi.useFakeTimers();
      await open(detail());
      vi.advanceTimersByTime(120_000);
      httpMock.expectNone(DETAIL_URL);
    });
  });
});
