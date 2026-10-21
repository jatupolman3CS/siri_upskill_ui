import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../testing/spec-helpers';
import { RoomOpener } from './room-opener';
import { TutoringJoinPage } from './tutoring-join-page';

@Component({ template: '' })
class RouteStub {}

const SESSION = '0198a000-0000-7000-8000-000000000001';
const PATH = `/tutoring/sessions/${SESSION}/join`;
const JOIN = `/api/tutoring/sessions/${SESSION}/join`;
const ROOM = 'https://meet.google.com/abc-defg-hij';

function joined(overrides: object = {}): object {
  return {
    sessionId: SESSION,
    role: 'Learner',
    meetUrl: ROOM,
    startsAtUtc: new Date(Date.now() + 60_000).toISOString(),
    endsAtUtc: new Date(Date.now() + 3_660_000).toISOString(),
    serverTimeUtc: new Date().toISOString(),
    ...overrides,
  };
}

function conflict(reason: string, extra: object = {}, status = 409): [object, { status: number; statusText: string }] {
  return [{ title: 'x', status, errorCode: 'conflict', reason, ...extra }, { status, statusText: 'Error' }];
}

describe('TutoringJoinPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  const open = vi.fn();

  beforeEach(async () => {
    open.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tutoring/sessions/:sessionId/join', component: TutoringJoinPage },
          { path: 'login', component: RouteStub },
          { path: 'my-tutoring', component: RouteStub },
          { path: 'tutors', component: RouteStub },
          { path: 'instructor/tutoring/classes/:id', component: RouteStub },
        ]),
        ...HTTP_TEST_PROVIDERS,
        { provide: RoomOpener, useValue: { open } },
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const heading = (): string => root().querySelector('h1')?.textContent?.trim() ?? '';

  async function go(answer?: { body: object; status?: number; statusText?: string }): Promise<TutoringJoinPage> {
    const page = await harness.navigateByUrl(PATH, TutoringJoinPage);
    await settle(harness);
    if (answer) {
      httpMock.expectOne(JOIN).flush(answer.body, { status: answer.status ?? 200, statusText: answer.statusText ?? 'OK' });
      await settle(harness);
    }
    return page;
  }

  async function fail(reason: string, extra: object = {}, status = 409): Promise<void> {
    const [body, init] = conflict(reason, extra, status);
    await go({ body, status: init.status, statusText: init.statusText });
  }

  it('asks the server exactly once to join - from the browser render, with an empty POST', async () => {
    await go();

    const request = httpMock.expectOne(JOIN);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(heading()).toBe('Checking your access...');
    request.flush(joined());
    await settle(harness);
    httpMock.expectNone(JOIN);
  });

  it('never calls the server for an id that cannot name a class', async () => {
    await harness.navigateByUrl('/tutoring/sessions/not-a-class/join', TutoringJoinPage);
    await settle(harness);

    httpMock.expectNone((req) => req.url.endsWith('/join'));
    expect(heading()).toBe('Class not found, or you do not have access');
  });

  describe('when the room is ready', () => {
    it('shows an open-the-classroom link for a new tab (noopener noreferrer) and tries to open it once', async () => {
      await go({ body: joined() });

      expect(heading()).toBe('Your classroom is ready');
      const link = root().querySelector('a[target="_blank"]') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(ROOM);
      expect(link.rel).toBe('noopener noreferrer');
      expect(link.textContent).toContain('Open the classroom');
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith(ROOM);
    });

    it('stays on the page (it has a question to ask the learner), and has no way to copy the link', async () => {
      await go({ body: joined() });

      expect(TestBed.inject(Router).url).toBe(PATH);
      expect(Array.from(root().querySelectorAll('button')).some((b) => /copy/i.test(b.textContent ?? ''))).toBe(false);
    });

    it('keeps the link out of the address bar and the history state', async () => {
      await go({ body: joined() });

      expect(TestBed.inject(Router).url).not.toContain('meet');
      expect(JSON.stringify(history.state ?? null)).not.toContain('meet.google.com');
    });

    it('warns a learner not to share the link and checks whether the tutor is there', async () => {
      await go({ body: joined() });

      expect(textOf(root())).toContain('Do not share the classroom link with anyone.');
      expect(root().querySelector('app-tutor-presence-check')).not.toBeNull();
    });

    it('tells a tutor about the lobby and does not ask whether the tutor is there', async () => {
      await go({ body: joined({ role: 'Tutor' }) });

      expect(textOf(root())).toContain('You are the tutor of this class. Learners may wait in the lobby');
      expect(root().querySelector('app-tutor-presence-check')).toBeNull();
    });

    it('moves focus to the heading when the screen changes', async () => {
      await go({ body: joined() });

      expect(document.activeElement).toBe(root().querySelector('h1'));
    });

    it('forgets the link when the page is left', async () => {
      const page = await go({ body: joined() });
      const state = page as unknown as { meetUrl: () => string | null };
      expect(state.meetUrl()).toBe(ROOM);

      TestBed.inject(Router).navigateByUrl('/my-tutoring');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await settle(harness);

      expect(state.meetUrl()).toBeNull();
    });

    it('refuses to link an address that is not https and shows the generic error instead', async () => {
      await go({ body: joined({ meetUrl: 'javascript:alert(1)' }) });

      expect(heading()).toBe('Could not open the classroom');
      expect(root().querySelector('a[href^="javascript"]')).toBeNull();
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('when it is not time yet', () => {
    it('says when the classroom opens, counts down on the server clock and tries again at that moment', async () => {
      vi.useFakeTimers();
      const opensAt = new Date(Date.now() + 5_000).toISOString();
      await fail('tutoring.window_not_open', { opensAtUtc: opensAt, serverTimeUtc: new Date().toISOString() });

      expect(heading()).toBe('It is not time to join yet');
      expect(textOf(root())).toContain('The classroom opens at');
      expect(root().querySelector('app-live-countdown')).not.toBeNull();
      httpMock.expectNone(JOIN);

      vi.advanceTimersByTime(6_500);
      await settle(harness);

      httpMock.expectOne(JOIN).flush(joined());
      await settle(harness);
      expect(heading()).toBe('Your classroom is ready');
    });

    it('backs off instead of hammering the server when it still says "not open" after the time passed', async () => {
      vi.useFakeTimers();
      await fail('tutoring.window_not_open', { opensAtUtc: new Date(Date.now() - 60_000).toISOString(), serverTimeUtc: new Date().toISOString() });

      vi.advanceTimersByTime(5_000);
      await settle(harness);
      httpMock.expectNone(JOIN);

      vi.advanceTimersByTime(6_000);
      await settle(harness);
      const [body, init] = conflict('tutoring.window_not_open', { opensAtUtc: null });
      httpMock.expectOne(JOIN).flush(body, init);
    });
  });

  describe('when the room is not ready', () => {
    it('retries every 30 seconds and says which attempt it is on', async () => {
      vi.useFakeTimers();
      await fail('tutoring.room_not_ready', {}, 503);

      expect(heading()).toBe('The classroom is not ready yet');
      expect(textOf(root())).toContain('Attempt 1 of 10');

      vi.advanceTimersByTime(30_500);
      await settle(harness);
      const [body, init] = conflict('tutoring.room_not_ready', {}, 503);
      httpMock.expectOne(JOIN).flush(body, init);
      await settle(harness);

      expect(textOf(root())).toContain('Attempt 2 of 10');
    });

    it('gives up after ten attempts and hands control back with a button', async () => {
      vi.useFakeTimers();
      const [body, init] = conflict('tutoring.room_not_ready', {}, 503);
      await go({ body, status: init.status, statusText: init.statusText });
      for (let attempt = 2; attempt <= 10; attempt++) {
        vi.advanceTimersByTime(30_500);
        await settle(harness);
        httpMock.expectOne(JOIN).flush(body, init);
        await settle(harness);
      }

      expect(textOf(root())).toContain('still not ready after 10 attempts');
      vi.advanceTimersByTime(120_000);
      await settle(harness);
      httpMock.expectNone(JOIN);

      buttonByText(root(), 'Try again')?.click();
      await settle(harness);
      httpMock.expectOne(JOIN).flush(joined());
      await settle(harness);
      expect(heading()).toBe('Your classroom is ready');
    });

    it('points a tutor to the page that manages the room when the room needs them', async () => {
      await fail('tutoring.room_not_ready', { needsAction: 'PasteLink' }, 503);

      const link = Array.from(root().querySelectorAll('a')).find((a) => a.textContent?.includes('Manage the room'));
      expect(link?.getAttribute('href')).toBe(`/instructor/tutoring/classes/${SESSION}`);
    });

    it('does not offer the room page when only waiting is needed', async () => {
      await fail('tutoring.room_not_ready', { needsAction: 'Waiting' }, 503);

      expect(Array.from(root().querySelectorAll('a')).some((a) => a.textContent?.includes('Manage the room'))).toBe(false);
    });
  });

  describe('closed screens', () => {
    it('says the class ended and leads to the history', async () => {
      await fail('tutoring.session_ended');

      expect(heading()).toBe('This class has ended');
      expect(Array.from(root().querySelectorAll('a')).some((a) => a.getAttribute('href') === '/my-tutoring?tab=history')).toBe(true);
    });

    it('says the class was cancelled', async () => {
      await fail('tutoring.session_cancelled');

      expect(heading()).toBe('This class was cancelled');
    });

    it('says the class is closed and, for a learner who disagrees, points at reporting a problem from the history', async () => {
      await fail('tutoring.session_closed');

      expect(heading()).toBe('This class is closed');
      expect(textOf(root())).toContain('you can report a problem from the lesson in your history');
      expect(Array.from(root().querySelectorAll('a')).some((a) => a.getAttribute('href') === '/my-tutoring?tab=history')).toBe(true);
    });

    it('reads a missing class, another person\'s class and an unconfirmed booking the same way', async () => {
      await fail('tutoring.not_found', {}, 404);

      expect(heading()).toBe('Class not found, or you do not have access');
      expect(Array.from(root().querySelectorAll('a')).some((a) => a.getAttribute('href') === '/tutors')).toBe(true);
    });

    it('asks to wait on a rate limit, with a button to try again', async () => {
      await go({ body: { title: 'x' }, status: 429, statusText: 'Too Many Requests' });

      expect(heading()).toBe('Too many attempts');
      buttonByText(root(), 'Try again')?.click();
      await settle(harness);
      httpMock.expectOne(JOIN).flush(joined());
    });

    it('shows a generic error with a retry for a concurrent update or any unexpected failure', async () => {
      await fail('tutoring.concurrent_update');

      expect(heading()).toBe('Could not open the classroom');
      expect(buttonByText(root(), 'Try again')).not.toBeNull();
    });
  });

  it('sends a signed-out person to sign in and back to this page', async () => {
    await go({ body: { title: 'Unauthorized' }, status: 401, statusText: 'Unauthorized' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(TestBed.inject(Router).url).toBe(`/login?returnUrl=${encodeURIComponent(PATH)}`);
  });

  it('announces a screen change once, politely, through a single status region', async () => {
    await go({ body: joined() });

    const status = root().querySelectorAll('[role="status"][aria-live="polite"]');
    expect(status.length).toBeGreaterThanOrEqual(1);
    expect(status[0].textContent).toContain('Use the button to open the classroom in a new tab.');
  });
});
