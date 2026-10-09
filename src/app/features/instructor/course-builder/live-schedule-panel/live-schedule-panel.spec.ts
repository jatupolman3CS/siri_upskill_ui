import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ApiError } from '../../../../core/http/error.interceptor';
import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { GOOGLE_AUTH_REDIRECT } from '../../../live/data/google-connect.service';
import type {
  CourseLiveSchedule,
  GoogleConnectionStatus,
  InstructorMeetingSummary,
  InstructorSessionListItem,
  LiveSession,
} from '../../../live/data/live-instructor.models';
import { LiveSubmitIssues } from '../../../live/data/live-submit-issues.service';
import type { LiveDisplayState } from '../../../live/data/live.models';
import { LiveSchedulePanel } from './live-schedule-panel';

registerLocaleData(localeTh);


const SCHEDULE_URL = '/api/catalog/instructor/courses/c1/live-schedule';
const MEETINGS_URL = '/api/live/instructor/courses/c1/meetings';
const STATES_URL = '/api/live/instructor/sessions';
const GOOGLE_URL = '/api/live/instructor/google/status';

const session = (id: string, overrides: Partial<LiveSession> = {}): LiveSession => ({
  id,
  courseId: 'c1',
  title: `Session ${id}`,
  description: null,
  startsAtUtc: '2026-10-08T03:00:00Z',
  endsAtUtc: '2026-10-08T05:00:00Z',
  sortOrder: 0,
  status: 'Scheduled',
  cancelReason: null,
  recordingEpisodeId: null,
  ...overrides,
});

const meeting = (sessionId: string, overrides: Partial<InstructorMeetingSummary> = {}): InstructorMeetingSummary => ({
  sessionId,
  provider: 'GoogleMeet',
  syncStatus: 'Synced',
  hasMeetingLink: true,
  isUsable: true,
  lastSyncAtUtc: null,
  needsAction: 'None',
  errorCode: null,
  ...overrides,
});

const schedule = (sessions: LiveSession[], overrides: Partial<CourseLiveSchedule> = {}): CourseLiveSchedule => ({
  courseId: 'c1',
  deliveryFormat: 'Hybrid',
  status: 'Draft',
  enrollmentDeadlineUtc: null,
  maxSeats: null,
  seatsUsed: 0,
  googleAttendeeSyncEnabled: false,
  sessions,
  ...overrides,
});

const google = (overrides: Partial<GoogleConnectionStatus> = {}): GoogleConnectionStatus => ({
  configured: true,
  connected: true,
  needsReconnect: false,
  googleEmail: 'teacher@gmail.com',
  connectedAtUtc: null,
  lastValidatedAtUtc: null,
  revokedReason: null,
  affectedSessionCount: 0,
  ...overrides,
});

const stateItem = (sessionId: string, displayState: LiveDisplayState, m: InstructorMeetingSummary): InstructorSessionListItem => ({
  sessionId,
  courseId: 'c1',
  courseTitle: 'Excel Pro',
  title: `Session ${sessionId}`,
  startsAtUtc: '2026-10-08T03:00:00Z',
  endsAtUtc: '2026-10-08T05:00:00Z',
  displayState,
  expectedLearners: 0,
  joinedLearners: 0,
  meeting: m,
  recordingEpisodeId: null,
  cancelReason: null,
});

interface Data {
  readonly schedule: CourseLiveSchedule;
  readonly meetings: InstructorMeetingSummary[];
  readonly states?: Record<string, LiveDisplayState>;
  readonly google?: GoogleConnectionStatus;
}

describe('LiveSchedulePanel', () => {
  let fixture: ComponentFixture<LiveSchedulePanel>;
  let httpMock: HttpTestingController;
  let redirect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    redirect = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: GOOGLE_AUTH_REDIRECT, useValue: redirect },
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
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  /** Mounts the panel and answers the four requests it makes on load. */
  async function open(data: Data): Promise<void> {
    fixture = TestBed.createComponent(LiveSchedulePanel);
    fixture.componentRef.setInput('courseId', 'c1');
    await settle();
    httpMock.expectOne(SCHEDULE_URL).flush(data.schedule);
    httpMock.expectOne(MEETINGS_URL).flush({ items: data.meetings });
    httpMock
      .expectOne((r) => r.url === STATES_URL)
      .flush({
        items: data.schedule.sessions.map((s) =>
          stateItem(s.id, data.states?.[s.id] ?? 'Upcoming', data.meetings.find((m) => m.sessionId === s.id) ?? meeting(s.id)),
        ),
        totalCount: data.schedule.sessions.length,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      });
    httpMock.expectOne(GOOGLE_URL).flush(data.google ?? google());
    await settle();
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const button = (label: string) =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

  it('shows the schedule: each session in Bangkok time with its server state and room status', async () => {
    await open({
      schedule: schedule([session('a'), session('b', { startsAtUtc: '2026-10-09T18:00:00Z', endsAtUtc: '2026-10-09T20:00:00Z' })]),
      meetings: [meeting('a'), meeting('b', { needsAction: 'PasteLink', syncStatus: 'AwaitingLink', hasMeetingLink: false, isUsable: false })],
    });

    expect(text()).toContain('Session a');
    expect(text()).toContain('10:00–12:00');
    // 18:00Z on the 9th is 01:00 on the 10th in Bangkok
    expect(text()).toContain('01:00–03:00');
    expect(text()).toContain('Upcoming');
    expect(text()).toContain('Room ready');
    expect(text()).toContain('Waiting for link');
    expect(text()).toContain('Thailand time');
  });

  it('reports the course delivery format to the builder once the schedule has loaded', async () => {
    fixture = TestBed.createComponent(LiveSchedulePanel);
    fixture.componentRef.setInput('courseId', 'c1');
    const reported: string[] = [];
    fixture.componentInstance.deliveryFormatChange.subscribe((format) => reported.push(format));
    await settle();
    httpMock.expectOne(SCHEDULE_URL).flush(schedule([session('a')], { deliveryFormat: 'Live' }));
    httpMock.expectOne(MEETINGS_URL).flush({ items: [meeting('a')] });
    httpMock
      .expectOne((r) => r.url === STATES_URL)
      .flush({ items: [stateItem('a', 'Upcoming', meeting('a'))], totalCount: 1, page: 1, pageSize: 50, totalPages: 1 });
    httpMock.expectOne(GOOGLE_URL).flush(google());
    await settle();

    expect(reported).toEqual(['Live']);
  });

  it('chooses the action from needsAction: PasteLink -> link field, ReconnectGoogle -> button, Retry -> button, Waiting -> status only', async () => {
    await open({
      schedule: schedule([session('p'), session('r'), session('t'), session('w')]),
      meetings: [
        meeting('p', { needsAction: 'PasteLink', syncStatus: 'AwaitingLink', hasMeetingLink: false, isUsable: false }),
        meeting('r', { needsAction: 'ReconnectGoogle', syncStatus: 'NeedsReconnect' }),
        meeting('t', { needsAction: 'Retry', syncStatus: 'Failed', hasMeetingLink: false, isUsable: false }),
        meeting('w', { needsAction: 'Waiting', syncStatus: 'Pending', hasMeetingLink: false, isUsable: false }),
      ],
    });

    const rowFor = (title: string) => Array.from(root().querySelectorAll('app-live-session-row')).find((r) => r.textContent?.includes(title)) as HTMLElement;
    expect(rowFor('Session p').querySelector('input[type="url"]')).not.toBeNull();
    expect(rowFor('Session r').textContent).toContain('Reconnect Google');
    expect(rowFor('Session t').textContent).toContain('Try creating the room again');
    expect(rowFor('Session w').querySelector('input')).toBeNull();
    expect(rowFor('Session w').textContent).toContain('Preparing the room');
  });

  describe('polling room status', () => {
    it('re-checks every 10 s while a room is Waiting, then stops once none is', async () => {
      vi.useFakeTimers();
      await open({
        schedule: schedule([session('w')]),
        meetings: [meeting('w', { needsAction: 'Waiting', syncStatus: 'Pending', hasMeetingLink: false, isUsable: false })],
      });

      vi.advanceTimersByTime(9_999);
      httpMock.expectNone(MEETINGS_URL);
      vi.advanceTimersByTime(1);
      TestBed.flushEffects();
      httpMock.expectOne(MEETINGS_URL).flush({ items: [meeting('w')] }); // ready now
      await settle();
      expect(text()).toContain('Room ready');

      vi.advanceTimersByTime(60_000);
      httpMock.expectNone(MEETINGS_URL);
    });

    it('never polls when no room is Waiting', async () => {
      vi.useFakeTimers();
      await open({
        schedule: schedule([session('a')]),
        meetings: [meeting('a', { needsAction: 'PasteLink', syncStatus: 'AwaitingLink', hasMeetingLink: false, isUsable: false })],
      });
      vi.advanceTimersByTime(120_000);
      httpMock.expectNone(MEETINGS_URL);
    });

    it('stops polling when the panel is destroyed', async () => {
      vi.useFakeTimers();
      await open({
        schedule: schedule([session('w')]),
        meetings: [meeting('w', { needsAction: 'Waiting', syncStatus: 'Pending', hasMeetingLink: false, isUsable: false })],
      });
      fixture.destroy();
      vi.advanceTimersByTime(60_000);
      httpMock.expectNone(MEETINGS_URL);
    });
  });

  describe('Google', () => {
    it('shows the connect banner only when configured and not connected, and Connect starts the OAuth flow', async () => {
      await open({ schedule: schedule([]), meetings: [], google: google({ connected: false, googleEmail: null }) });
      expect(text()).toContain('Connect Google Calendar');

      button('Connect Google Calendar')?.click();
      const req = httpMock.expectOne('/api/live/instructor/google/connect');
      expect(req.request.body).toEqual({ returnPath: '/instructor/courses/c1/builder' });
      req.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=1' });
      expect(redirect).toHaveBeenCalled();
    });

    it('hides the banner once connected', async () => {
      await open({ schedule: schedule([]), meetings: [] });
      expect(button('Connect Google Calendar')).toBeUndefined();
    });

    it('when the server has no Google client: no connect button, manual-link explanation instead', async () => {
      await open({ schedule: schedule([]), meetings: [], google: google({ configured: false, connected: false }) });
      expect(button('Connect Google Calendar')).toBeUndefined();
      expect(text()).toContain('has not enabled the Google connection yet');
    });

    it('always shows the fixed warning about Google plan limits and the host-must-admit tip', async () => {
      await open({ schedule: schedule([]), meetings: [] });
      expect(text()).toContain('about 100 people and up to 60 minutes');
      expect(text()).toContain('host must admit');
    });

    it('attendee sync: explains itself, and the switch PUTs the new value', async () => {
      await open({ schedule: schedule([]), meetings: [] });
      expect(text()).toContain('learners do not see each other’s emails');
      const toggle = root().querySelector('button[role="switch"]') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-checked')).toBe('false');

      toggle.click();
      const req = httpMock.expectOne('/api/catalog/instructor/courses/c1/live-settings');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ googleAttendeeSyncEnabled: true });
      req.flush({ courseId: 'c1', googleAttendeeSyncEnabled: true });
      await settle();
      httpMock.expectOne(SCHEDULE_URL).flush(schedule([], { googleAttendeeSyncEnabled: true }));
      await settle();
      expect((root().querySelector('button[role="switch"]') as HTMLElement).getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('delivery format', () => {
    it('an on-demand course shows only the format selector and an explanation', async () => {
      await open({ schedule: schedule([], { deliveryFormat: 'OnDemand' }), meetings: [] });
      expect(text()).toContain('This course is self-paced');
      expect(root().querySelector('app-live-session-row')).toBeNull();
      expect(button('Add a session')).toBeUndefined();
    });

    it('changing the format PUTs it and refetches', async () => {
      await open({ schedule: schedule([], { deliveryFormat: 'OnDemand' }), meetings: [] });
      const select = root().querySelector('select') as HTMLSelectElement;
      select.value = 'Live';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const req = httpMock.expectOne('/api/catalog/instructor/courses/c1/delivery-format');
      expect(req.request.body).toEqual({ deliveryFormat: 'Live' });
      req.flush({ id: 'c1', deliveryFormat: 'Live' });
      await settle();
      httpMock.expectOne(SCHEDULE_URL).flush(schedule([], { deliveryFormat: 'Live' }));
      httpMock.expectOne(MEETINGS_URL).flush({ items: [] });
      httpMock.expectOne((r) => r.url === STATES_URL).flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
      await settle();
    });

    it('does not offer "self-paced" while scheduled sessions exist (they must be cancelled first)', async () => {
      await open({ schedule: schedule([session('a')]), meetings: [meeting('a')] });
      const option = Array.from(root().querySelectorAll('select option')).find((o) => o.textContent?.includes('Self-paced')) as HTMLOptionElement;
      expect(option.disabled).toBe(true);
      expect(text()).toContain('Cancel every session that has not started yet');
    });
  });

  describe('session states', () => {
    it('an ended session offers recording upload; a cancelled one offers nothing', async () => {
      await open({
        schedule: schedule([session('e'), session('c', { status: 'Cancelled', cancelReason: 'Ill' })]),
        meetings: [meeting('e'), meeting('c')],
        states: { e: 'Ended', c: 'Cancelled' },
      });

      const rowFor = (title: string) => Array.from(root().querySelectorAll('app-live-session-row')).find((r) => r.textContent?.includes(title)) as HTMLElement;
      expect(rowFor('Session e').textContent).toContain('Upload recording');
      expect(rowFor('Session e').textContent).toContain('Ended');
      const cancelled = rowFor('Session c');
      expect(cancelled.textContent).toContain('Cancelled: Ill');
      expect(cancelled.querySelector('app-live-meeting-actions')).toBeNull();
      expect(cancelled.textContent).not.toContain('Cancel session');
      expect(cancelled.textContent).not.toContain('Edit');
    });

    it('an upcoming session can be edited and cancelled; cancelling goes through the reason dialog', async () => {
      await open({ schedule: schedule([session('a')]), meetings: [meeting('a')] });
      const row = root().querySelector('app-live-session-row') as HTMLElement;
      expect(row.textContent).toContain('Edit');
      (Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Cancel session')) as HTMLButtonElement).click();
      await settle();
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Reason for cancelling');
    });
  });

  describe('submit-for-review refusal (live.meetings_not_ready)', () => {
    it('marks the named sessions that still have no usable room, and un-marks them once the room is usable', async () => {
      const issues = TestBed.inject(LiveSubmitIssues);
      issues.capture(new ApiError(400, 'x', 'validation', { reason: 'live.meetings_not_ready', sessionIds: ['b'] }));
      await open({
        schedule: schedule([session('a'), session('b')]),
        meetings: [meeting('a'), meeting('b', { needsAction: 'PasteLink', syncStatus: 'AwaitingLink', hasMeetingLink: false, isUsable: false })],
      });

      const rowFor = (title: string) => Array.from(root().querySelectorAll('app-live-session-row')).find((r) => r.textContent?.includes(title)) as HTMLElement;
      expect(rowFor('Session b').textContent).toContain('cannot be submitted for review');
      expect(rowFor('Session a').textContent).not.toContain('cannot be submitted for review');
      expect(text()).toContain('1 session(s) have no usable room yet');

      // the instructor fixes it
      (fixture.componentInstance as unknown as { reloadAll(): void }).reloadAll();
      await settle();
      httpMock.expectOne(SCHEDULE_URL).flush(schedule([session('a'), session('b')]));
      httpMock.expectOne(MEETINGS_URL).flush({ items: [meeting('a'), meeting('b')] });
      httpMock.expectOne((r) => r.url === STATES_URL).flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
      await settle();
      expect(rowFor('Session b').textContent).not.toContain('cannot be submitted for review');
    });
  });

  it('shows an error state with retry when the schedule cannot be loaded', async () => {
    fixture = TestBed.createComponent(LiveSchedulePanel);
    fixture.componentRef.setInput('courseId', 'c1');
    await settle();
    httpMock.expectOne(SCHEDULE_URL).flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(MEETINGS_URL).flush({ items: [] });
    httpMock.expectOne((r) => r.url === STATES_URL).flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
    httpMock.expectOne(GOOGLE_URL).flush(google());
    await settle();

    expect(text()).toContain('Could not load the live schedule');
    button('Try again')?.click();
    await settle();
    httpMock.expectOne(SCHEDULE_URL).flush(schedule([]));
    httpMock.expectOne(MEETINGS_URL).flush({ items: [] });
    httpMock.expectOne((r) => r.url === STATES_URL).flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
    httpMock.expectOne(GOOGLE_URL).flush(google());
    await settle();
    expect(text()).toContain('Live sessions');
  });
});
