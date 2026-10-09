import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { SeoService } from '../../../../core/seo/seo.service';
import type { JoinLiveSessionResponse } from '../../data/live-learner.models';
import { type JoinState, REDIRECT_DELAY_MS, ROOM_RETRY_INTERVAL_MS, ROOM_RETRY_MAX_ATTEMPTS } from './live-join-state';
import { LiveJoinPage } from './live-join-page';
import { RoomRedirector } from './room-redirector';

const SESSION_ID = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const JOIN_URL = `/api/live/sessions/${SESSION_ID}/join`;
const ROOM_URL = 'https://meet.google.com/abc-defg-hij';
const NOW = Date.parse('2026-10-08T02:00:00Z');

interface PageInternals {
  readonly state: Signal<JoinState>;
  readonly meetUrl: Signal<string | null>;
}

describe('LiveJoinPage', () => {
  let fixture: ComponentFixture<LiveJoinPage>;
  let httpMock: HttpTestingController;
  let redirector: { go: ReturnType<typeof vi.fn> };
  let router: Router;

  function configure(sessionId: string = SESSION_ID): void {
    redirector = { go: vi.fn() };
    TestBed.configureTestingModule({
      imports: [LiveJoinPage],
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ sessionId }) } } },
        { provide: RoomRedirector, useValue: redirector },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    TestBed.inject(TranslationService).setLocale('en');
  }

  function internals(): PageInternals {
    return fixture.componentInstance as unknown as PageInternals;
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function heading(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('h1') as HTMLElement;
  }

  /** Creates the page and runs the first render, which is when (and only when) the one join request goes out. */
  function open(): TestRequest {
    fixture = TestBed.createComponent(LiveJoinPage);
    fixture.detectChanges();
    return httpMock.expectOne(JOIN_URL);
  }

  function fail(req: TestRequest, status: number, body: Record<string, unknown> = {}): void {
    req.flush({ status, ...body }, { status, statusText: 'err' });
    fixture.detectChanges();
  }

  function succeed(req: TestRequest, meetUrl: string = ROOM_URL): void {
    const body: JoinLiveSessionResponse = {
      sessionId: SESSION_ID,
      meetUrl,
      startsAtUtc: '2026-10-08T03:00:00Z',
      endsAtUtc: '2026-10-08T05:00:00Z',
      serverTimeUtc: '2026-10-08T02:55:00Z',
    };
    req.flush(body);
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  describe('when it starts', () => {
    beforeEach(() => configure());

    it('performs no HTTP in the constructor or before the first render', () => {
      fixture = TestBed.createComponent(LiveJoinPage);
      httpMock.expectNone(JOIN_URL);
      expect(internals().state().kind).toBe('checking');
      // Drain the join request the first render will make so verify() stays satisfied.
      fixture.detectChanges();
      httpMock.expectOne(JOIN_URL).flush({}, { status: 500, statusText: 'err' });
    });

    it('makes exactly one POST on first render, and none on later change-detection passes', () => {
      const req = open();
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      fixture.detectChanges();
      fixture.detectChanges();
      httpMock.expectNone(JOIN_URL);
      req.flush({}, { status: 500, statusText: 'err' });
    });

    it('shows the checking state with a polite status region and noindex metadata', () => {
      const seo = vi.spyOn(TestBed.inject(SeoService), 'set');
      const req = open();
      expect(text()).toContain('Checking your access');
      const status = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
      expect(status?.getAttribute('aria-live')).toBe('polite');
      expect(seo).toHaveBeenCalledWith(expect.objectContaining({ robots: 'noindex' }));
      req.flush({}, { status: 500, statusText: 'err' });
    });
  });

  describe('success', () => {
    beforeEach(() => configure());

    it('keeps the room link in a signal, redirects after a short pause, and offers a safe fallback link', () => {
      const req = open();
      vi.useFakeTimers();
      succeed(req);

      expect(internals().state().kind).toBe('redirecting');
      expect(internals().meetUrl()).toBe(ROOM_URL);
      expect(text()).toContain('Taking you to the classroom');
      expect(redirector.go).not.toHaveBeenCalled();

      const fallback = (fixture.nativeElement as HTMLElement).querySelector('a[target="_blank"]') as HTMLAnchorElement;
      expect(fallback.getAttribute('href')).toBe(ROOM_URL);
      expect(fallback.getAttribute('rel')).toBe('noopener noreferrer');

      vi.advanceTimersByTime(REDIRECT_DELAY_MS);
      expect(redirector.go).toHaveBeenCalledTimes(1);
      expect(redirector.go).toHaveBeenCalledWith(ROOM_URL);
    });

    it('has no copy-link control', () => {
      const req = open();
      vi.useFakeTimers();
      succeed(req);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('button')).toHaveLength(0);
      expect(root.textContent?.toLowerCase()).not.toContain('copy');
    });

    it('does not write the room link to storage, the URL or the console', () => {
      const log = vi.spyOn(console, 'log');
      const warn = vi.spyOn(console, 'warn');
      const error = vi.spyOn(console, 'error');
      const req = open();
      vi.useFakeTimers();
      succeed(req);
      vi.advanceTimersByTime(REDIRECT_DELAY_MS);

      const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
      expect(dump).not.toContain('meet.google.com');
      expect(router.navigate).not.toHaveBeenCalled();
      expect(location.href).not.toContain('meet.google.com');
      for (const spy of [log, warn, error]) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain('meet.google.com');
      }
    });

    it('clears the room link on destroy and cancels a pending redirect', () => {
      const req = open();
      vi.useFakeTimers();
      succeed(req);
      expect(internals().meetUrl()).toBe(ROOM_URL);

      fixture.destroy();
      expect(internals().meetUrl()).toBeNull();
      vi.advanceTimersByTime(REDIRECT_DELAY_MS * 5);
      expect(redirector.go).not.toHaveBeenCalled();
    });

    it('does not also auto-redirect once the learner picks the fallback link themselves', () => {
      const req = open();
      vi.useFakeTimers();
      succeed(req);
      const fallback = (fixture.nativeElement as HTMLElement).querySelector('a[target="_blank"]') as HTMLAnchorElement;
      fallback.addEventListener('click', (event) => event.preventDefault());
      fallback.click();
      vi.advanceTimersByTime(REDIRECT_DELAY_MS * 5);
      expect(redirector.go).not.toHaveBeenCalled();
    });

    it.each(['http://meet.google.com/abc', 'javascript:alert(1)', 'not a url'])(
      'refuses to navigate to an unsafe link (%s) and shows the error state instead',
      (unsafe) => {
        const req = open();
        vi.useFakeTimers();
        succeed(req, unsafe);
        expect(internals().state().kind).toBe('error');
        expect(internals().meetUrl()).toBeNull();
        vi.advanceTimersByTime(REDIRECT_DELAY_MS * 5);
        expect(redirector.go).not.toHaveBeenCalled();
      },
    );
  });

  describe('failure states', () => {
    beforeEach(() => configure());

    it('notOpen: shows the opening time and a countdown, then retries by itself when the window opens', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const first = open();
      fail(first, 409, {
        reason: 'live.window_not_open',
        opensAtUtc: '2026-10-08T02:45:00Z',
        serverTimeUtc: '2026-10-08T02:00:00Z',
      });

      expect(internals().state().kind).toBe('notOpen');
      expect(text()).toContain("It's not time to join yet");
      expect(text()).toContain('The room opens at');
      const countdown = (fixture.nativeElement as HTMLElement).querySelector('app-live-countdown');
      expect(countdown?.getAttribute('role')).toBe('timer');
      expect(countdown?.getAttribute('aria-live')).toBe('off');

      httpMock.expectNone(JOIN_URL);
      vi.setSystemTime(NOW + 45 * 60_000 + 1000);
      vi.advanceTimersByTime(45 * 60_000 + 1000);
      succeed(httpMock.expectOne(JOIN_URL));
      expect(internals().state().kind).toBe('redirecting');
    });

    it('notOpen: backs off instead of hammering the server when it still refuses after the window time', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      fail(open(), 409, {
        reason: 'live.window_not_open',
        opensAtUtc: '2026-10-08T01:59:00Z', // already in the past by our clock
        serverTimeUtc: '2026-10-08T02:00:00Z',
      });
      vi.advanceTimersByTime(9_000);
      httpMock.expectNone(JOIN_URL);
      vi.advanceTimersByTime(1_500);
      httpMock.expectOne(JOIN_URL).flush({}, { status: 500, statusText: 'err' });
    });

    it('ended: offers the replay when the server names a recording', () => {
      fail(open(), 409, { reason: 'live.session_ended', recordingEpisodeId: 'ep-7', courseSlug: 'excel-pro' });
      expect(text()).toContain('This live session has ended');
      const replay = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) =>
        a.textContent?.includes('Watch replay'),
      );
      expect(replay?.getAttribute('href')).toBe('/learn/excel-pro/ep-7');
    });

    it('ended: says the recording is not ready when there is none', () => {
      fail(open(), 409, { reason: 'live.session_ended' });
      expect(text()).toContain("recording isn't ready yet");
      expect((fixture.nativeElement as HTMLElement).querySelector('a[href^="/learn"]')).toBeNull();
    });

    it('cancelled', () => {
      fail(open(), 409, { reason: 'live.session_cancelled' });
      expect(text()).toContain('This live session was cancelled');
    });

    it('notFoundOrNoAccess: sends the learner to their courses or the catalog', () => {
      fail(open(), 404, { reason: 'live.not_found' });
      expect(text()).toContain("Session not found, or you don't have access");
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('a[href="/my-courses"]')).not.toBeNull();
      expect(root.querySelector('a[href="/courses"]')).not.toBeNull();
    });

    it('rateLimited (429): says to wait and offers a retry', () => {
      fail(open(), 429);
      expect(internals().state().kind).toBe('rateLimited');
      expect(text()).toContain('Too many attempts');
      expect(text()).toContain('Try again');
    });

    it('error: offers a retry, which asks the server again', () => {
      fail(open(), 500);
      expect(internals().state().kind).toBe('error');
      const retry = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Try again'),
      ) as HTMLButtonElement;
      retry.click();
      fixture.detectChanges();
      expect(internals().state().kind).toBe('checking');
      succeed(httpMock.expectOne(JOIN_URL));
      expect(internals().state().kind).toBe('redirecting');
    });

    it('sends an unauthenticated learner to sign in and back, without showing a failure screen', () => {
      fail(open(), 401);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: `/live/${SESSION_ID}/join` } });
    });

    it('does not announce the countdown: only the status region is a live region', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      fail(open(), 409, {
        reason: 'live.window_not_open',
        opensAtUtc: '2026-10-08T02:45:00Z',
        serverTimeUtc: '2026-10-08T02:00:00Z',
      });
      const root = fixture.nativeElement as HTMLElement;
      const polite = root.querySelectorAll('[aria-live="polite"]');
      expect(polite).toHaveLength(1);
      expect(polite[0].querySelector('app-live-countdown')).toBeNull();
      httpMock.match(JOIN_URL);
    });
  });

  describe('room not ready (503)', () => {
    beforeEach(() => configure());

    it('retries every 30 seconds, at most 10 times, then hands control back to the learner', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      let req = open();
      for (let attempt = 1; attempt <= ROOM_RETRY_MAX_ATTEMPTS; attempt++) {
        fail(req, 503, { reason: 'live.meeting_not_ready' });
        const state = internals().state();
        expect(state.kind).toBe('roomNotReady');
        if (attempt < ROOM_RETRY_MAX_ATTEMPTS) {
          expect(text()).toContain(`Attempt ${attempt} of ${ROOM_RETRY_MAX_ATTEMPTS}`);
          vi.advanceTimersByTime(ROOM_RETRY_INTERVAL_MS - 1);
          httpMock.expectNone(JOIN_URL);
          vi.advanceTimersByTime(1);
          req = httpMock.expectOne(JOIN_URL);
        }
      }

      expect(text()).toContain('still wasn');
      vi.advanceTimersByTime(ROOM_RETRY_INTERVAL_MS * 4);
      httpMock.expectNone(JOIN_URL);

      const retry = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Try again'),
      ) as HTMLButtonElement;
      retry.click();
      fixture.detectChanges();
      succeed(httpMock.expectOne(JOIN_URL));
      expect(internals().state().kind).toBe('redirecting');
    });

    it('stops retrying when the page is destroyed', () => {
      vi.useFakeTimers();
      fail(open(), 503, { reason: 'live.meeting_not_ready' });
      fixture.destroy();
      vi.advanceTimersByTime(ROOM_RETRY_INTERVAL_MS * 3);
      httpMock.expectNone(JOIN_URL);
    });
  });

  describe('focus and notices', () => {
    beforeEach(() => configure());

    it('moves focus to the heading when the screen changes', async () => {
      const req = open();
      document.body.appendChild(fixture.nativeElement);
      fail(req, 409, { reason: 'live.session_cancelled' });
      await fixture.whenStable();
      expect(document.activeElement).toBe(heading());
      fixture.nativeElement.remove();
    });

    it('shows the do-not-forward and refund notices while the learner is on the way in, not after a refusal', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      fail(open(), 409, {
        reason: 'live.window_not_open',
        opensAtUtc: '2026-10-08T02:45:00Z',
        serverTimeUtc: '2026-10-08T02:00:00Z',
      });
      expect(text()).toContain("Don't share the classroom link");
      expect(text()).toContain('can no longer be refunded');
      httpMock.match(JOIN_URL);
    });

    it('omits the entry notices on a terminal refusal', () => {
      fail(open(), 404, { reason: 'live.not_found' });
      expect(text()).not.toContain("Don't share the classroom link");
    });
  });

  describe('a malformed session id', () => {
    beforeEach(() => configure('../../etc/passwd'));

    it('shows not-found without ever contacting the server', () => {
      fixture = TestBed.createComponent(LiveJoinPage);
      fixture.detectChanges();
      httpMock.expectNone(() => true);
      expect(internals().state().kind).toBe('notFoundOrNoAccess');
    });
  });
});
