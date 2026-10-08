import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { ToastService } from '../../../../shared/toast/toast.service';
import type { MySessionItem, MySessionsResponse } from '../../data/live-learner.models';
import { BOUNDARY_SLACK_MS } from '../live-clock';
import { LiveTab } from './live-tab';

const COURSE_ID = 'c-1';
const SESSIONS_URL = `/api/live/courses/${COURSE_ID}/my-sessions`;
const NOW = Date.parse('2026-10-08T02:00:00Z');

function item(overrides: Partial<MySessionItem> = {}): MySessionItem {
  return {
    id: 's-1',
    title: 'Session one',
    description: null,
    startsAtUtc: '2026-10-08T03:00:00Z',
    endsAtUtc: '2026-10-08T05:00:00Z',
    displayState: 'Upcoming',
    status: 'Scheduled',
    cancelReason: null,
    canJoin: false,
    joinOpensAtUtc: '2026-10-08T02:45:00Z',
    roomReady: true,
    hasRecording: false,
    recordingEpisodeId: null,
    inviteStatus: null,
    ...overrides,
  };
}

function response(sessions: readonly MySessionItem[], overrides: Partial<MySessionsResponse> = {}): MySessionsResponse {
  return {
    courseId: COURSE_ID,
    courseSlug: 'excel-pro',
    timezone: 'Asia/Bangkok',
    serverTimeUtc: new Date(Date.now()).toISOString(),
    hasAttendedAnySession: true,
    sessions,
    ...overrides,
  };
}

describe('LiveTab', () => {
  let fixture: ComponentFixture<LiveTab>;
  let httpMock: HttpTestingController;
  let router: Router;

  function create(): HTMLElement {
    fixture = TestBed.createComponent(LiveTab);
    fixture.componentRef.setInput('courseId', COURSE_ID);
    fixture.componentRef.setInput('courseSlug', 'excel-pro');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function respond(req: TestRequest, body: MySessionsResponse): void {
    req.flush(body);
    fixture.detectChanges();
  }

  function buttonLabelled(root: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({
      imports: [LiveTab],
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    TestBed.inject(TranslationService).setLocale('en');
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('shows a skeleton with a polite status while the schedule loads', () => {
    const root = create();
    expect(root.getAttribute('aria-busy')).toBeNull(); // the <section> is the first child
    expect(root.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(root.querySelector('app-skeleton')).not.toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Loading the schedule');
    httpMock.expectOne(SESSIONS_URL).flush(response([]));
  });

  it('shows an empty state when there are no sessions', () => {
    const root = create();
    respond(httpMock.expectOne(SESSIONS_URL), response([]));
    expect(root.textContent).toContain('No sessions scheduled yet');
  });

  it('shows an error with a retry that asks the server again', () => {
    const root = create();
    httpMock.expectOne(SESSIONS_URL).flush({}, { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load the schedule");

    buttonLabelled(root, 'Try again')?.click();
    fixture.detectChanges();
    respond(httpMock.expectOne(SESSIONS_URL), response([item()]));
    expect(root.textContent).toContain('Session one');
  });

  it('quietly reports "unavailable" on a 404 (no active enrollment) instead of showing an error', () => {
    const unavailable = vi.fn();
    const root = create();
    fixture.componentInstance.unavailable.subscribe(unavailable);
    httpMock.expectOne(SESSIONS_URL).flush({ reason: 'live.not_found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('app-live-session-card')).toBeNull();
  });

  it('groups upcoming/live sessions apart from past ones, in the server order', () => {
    const root = create();
    respond(
      httpMock.expectOne(SESSIONS_URL),
      response([
        item({ id: 'past', title: 'Old session', displayState: 'Ended', startsAtUtc: '2026-10-01T03:00:00Z', endsAtUtc: '2026-10-01T05:00:00Z', joinOpensAtUtc: '2026-10-01T02:45:00Z' }),
        item({ id: 'next', title: 'Next session' }),
      ]),
    );
    const headings = Array.from(root.querySelectorAll('h3')).map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Upcoming', 'Past sessions']);
    expect(root.querySelectorAll('app-live-session-card')).toHaveLength(2);
  });

  it('keeps the join button disabled while canJoin is false and enables it only when the server says so', () => {
    const root = create();
    respond(httpMock.expectOne(SESSIONS_URL), response([item({ canJoin: false })]));
    expect(buttonLabelled(root, 'Join class')?.disabled).toBe(true);

    fixture.componentInstance['reload']();
    fixture.detectChanges();
    respond(httpMock.expectOne(SESSIONS_URL), response([item({ displayState: 'Live', canJoin: true })]));
    expect(buttonLabelled(root, 'Join class')?.disabled).toBe(false);
  });

  it('navigates to the join page when a joinable session is chosen', () => {
    const root = create();
    respond(httpMock.expectOne(SESSIONS_URL), response([item({ displayState: 'Live', canJoin: true })]));
    buttonLabelled(root, 'Join class')?.click();
    expect(router.navigate).toHaveBeenCalledWith(['/live', 's-1', 'join']);
  });

  it('shows the refund notice before the first join, and hides it once the learner has attended', () => {
    const root = create();
    respond(httpMock.expectOne(SESSIONS_URL), response([item()], { hasAttendedAnySession: false }));
    expect(root.querySelector('app-live-refund-notice')).not.toBeNull();
    expect(root.textContent).toContain('can no longer be refunded');

    fixture.componentInstance['reload']();
    fixture.detectChanges();
    respond(httpMock.expectOne(SESSIONS_URL), response([item()], { hasAttendedAnySession: true }));
    expect(root.querySelector('app-live-refund-notice')).toBeNull();
  });

  describe('refetching at the moments the server state can change', () => {
    it('asks again exactly when the join window opens, using the server clock, and shows the new state', () => {
      const root = create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()], { serverTimeUtc: '2026-10-08T02:00:00Z' }));
      expect(buttonLabelled(root, 'Join class')?.disabled).toBe(true);

      // 45 minutes to joinOpensAtUtc (+ slack): nothing before that...
      vi.advanceTimersByTime(45 * 60_000 + BOUNDARY_SLACK_MS - 1);
      httpMock.expectNone(SESSIONS_URL);
      // ...and a refetch right at it.
      vi.advanceTimersByTime(1);
      vi.setSystemTime(NOW + 45 * 60_000 + BOUNDARY_SLACK_MS);
      respond(httpMock.expectOne(SESSIONS_URL), response([item({ displayState: 'Live', canJoin: true })]));
      expect(buttonLabelled(root, 'Join class')?.disabled).toBe(false);
    });

    it('does not flash the skeleton during a boundary refetch and keeps the list on screen', () => {
      const root = create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()], { serverTimeUtc: '2026-10-08T02:00:00Z' }));
      vi.advanceTimersByTime(45 * 60_000 + BOUNDARY_SLACK_MS);
      const req = httpMock.expectOne(SESSIONS_URL);
      fixture.detectChanges();
      expect(root.querySelector('app-skeleton')).toBeNull();
      expect(root.textContent).toContain('Session one');
      req.flush(response([item()]));
    });

    it('keeps the last good data and says so when a background refetch fails', () => {
      const root = create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()], { serverTimeUtc: '2026-10-08T02:00:00Z' }));
      vi.advanceTimersByTime(45 * 60_000 + BOUNDARY_SLACK_MS);
      httpMock.expectOne(SESSIONS_URL).flush({}, { status: 500, statusText: 'err' });
      fixture.detectChanges();
      expect(root.textContent).toContain('Session one');
      expect(root.textContent).toContain("Couldn't refresh the schedule");
      expect(root.querySelector('app-skeleton')).toBeNull();
    });

    it('schedules nothing when every session is already over', () => {
      create();
      respond(
        httpMock.expectOne(SESSIONS_URL),
        response([item({ displayState: 'Ended' }), item({ id: 's-2', displayState: 'Cancelled', status: 'Cancelled' })]),
      );
      vi.advanceTimersByTime(24 * 60 * 60_000);
      httpMock.expectNone(SESSIONS_URL);
    });

    it('stops its timer when destroyed', () => {
      create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()], { serverTimeUtc: '2026-10-08T02:00:00Z' }));
      fixture.destroy();
      vi.advanceTimersByTime(60 * 60_000);
      httpMock.expectNone(SESSIONS_URL);
    });
  });

  describe('add to calendar', () => {
    let createObjectUrl: ReturnType<typeof vi.fn>;
    let revokeObjectUrl: ReturnType<typeof vi.fn>;
    let anchorClick: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      createObjectUrl = vi.fn(() => 'blob:calendar');
      revokeObjectUrl = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true, writable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectUrl, configurable: true, writable: true });
      anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    it('downloads the .ics through HttpClient and saves it as live-<id>.ics', () => {
      const root = create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()]));
      buttonLabelled(root, 'Add to calendar')?.click();
      fixture.detectChanges();

      const req = httpMock.expectOne('/api/live/sessions/s-1/calendar.ics');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar' }));

      expect(createObjectUrl).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('live-s-1.ics');
      vi.advanceTimersByTime(1);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:calendar');
    });

    it('ignores a second click while a download is in flight', () => {
      const root = create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()]));
      buttonLabelled(root, 'Add to calendar')?.click();
      fixture.componentInstance['addToCalendar']('s-1');
      httpMock.expectOne('/api/live/sessions/s-1/calendar.ics').flush(new Blob(['x']));
    });

    it('tells the learner when the session can no longer be added (409) without breaking the tab', () => {
      const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
      const root = create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()]));
      buttonLabelled(root, 'Add to calendar')?.click();
      httpMock.expectOne('/api/live/sessions/s-1/calendar.ics').flush(new Blob(['x']), { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(toast).toHaveBeenCalledWith('This session has ended or was cancelled, so it can\'t be added to a calendar.');
      expect(createObjectUrl).not.toHaveBeenCalled();
      expect(root.textContent).toContain('Session one');
    });

    it('shows a generic message for any other download failure', () => {
      const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
      const root = create();
      respond(httpMock.expectOne(SESSIONS_URL), response([item()]));
      buttonLabelled(root, 'Add to calendar')?.click();
      httpMock.expectOne('/api/live/sessions/s-1/calendar.ics').flush(new Blob(['x']), { status: 500, statusText: 'err' });
      expect(toast).toHaveBeenCalledWith("Couldn't download the calendar file. Please try again.");
    });
  });
});
