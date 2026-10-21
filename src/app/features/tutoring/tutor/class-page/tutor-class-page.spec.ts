import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { GOOGLE_AUTH_REDIRECT } from '../../../live/data/google-connect.service';
import { type Route, attendance, cancellationQuote, classLearner, roomStatus, settleWith } from '../testing/tutor-ops-fixtures';
import { TutorClassPage } from './tutor-class-page';

registerLocaleData(localeTh);

const CLASS_URL = '/api/tutoring/tutor/classes/s-1';
const MATERIALS_URL = '/api/tutoring/sessions/s-1/materials';
const MEET_URL = 'https://meet.google.com/abc-defg-hij';

describe('TutorClassPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  const redirect = vi.fn();

  beforeEach(() => {
    redirect.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: GOOGLE_AUTH_REDIRECT, useValue: redirect },
        provideRouter([{ path: 'instructor/tutoring/classes/:sessionId', component: TutorClassPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  const buttons = (): HTMLButtonElement[] => [...page().querySelectorAll('button')];
  const button = (label: string): HTMLButtonElement => buttons().find((b) => b.textContent?.trim() === label)!;
  const buttonStarting = (label: string): HTMLButtonElement => buttons().find((b) => b.textContent?.trim().startsWith(label))!;

  function routes(overrides: readonly Route[] = []): readonly Route[] {
    return [
      ...overrides,
      { url: `${CLASS_URL}/attendance`, reply: attendance() },
      { url: `${CLASS_URL}/room`, method: 'GET', reply: roomStatus() },
      { url: MATERIALS_URL, method: 'GET', reply: [] },
      { url: `${CLASS_URL}/cancellation-quote`, reply: cancellationQuote() },
    ];
  }

  async function open(overrides: readonly Route[] = []) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/classes/s-1', TutorClassPage);
    return settleWith(harness, httpMock, routes(overrides));
  }

  const settle = (overrides: readonly Route[] = []) => settleWith(harness, httpMock, routes(overrides));

  async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string, overrides: readonly Route[] = []): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await settle(overrides);
  }

  describe('overview', () => {
    it('shows the learners by nickname and grade only, with the cards a scheduled class needs', async () => {
      await open();
      expect(text()).toContain('Nok');
      expect(text()).toContain('Secondary 4');
      expect(text()).toContain('Minor');
      expect(text()).toContain('Start class');
      expect(text()).toContain('Classroom');
      expect(text()).toContain('Complete the class');
      expect(text()).toContain('Materials');
      expect(text()).toContain('Cancel this class');
      // Nothing that could identify a guardian is ever rendered.
      expect(text()).not.toMatch(/@|email|phone/i);
    });

    it('says a class that is missing or not the tutor\'s was not found', async () => {
      await open([{ url: `${CLASS_URL}/attendance`, status: 404, reply: { status: 404, reason: 'tutoring.not_found' } }]);
      expect(text()).toContain('Class not found');
      expect(text()).not.toContain('Start class');
    });

    it('shows an error with a retry when the class cannot be loaded', async () => {
      await open([{ url: `${CLASS_URL}/attendance`, status: 500, reply: { status: 500 } }]);
      expect(text()).toContain('Could not load the class');
      button('Try again').click();
      await settle();
      expect(text()).toContain('Start class');
    });

    it('shrinks to the cancel action when the verified-only calls refuse (a suspended tutor), and cancelling still works', async () => {
      await open([{ url: `${CLASS_URL}/attendance`, status: 403, reply: { status: 403, errorCode: 'forbidden' } }]);
      expect(text()).toContain('Your tutor account is not active right now');
      expect(text()).not.toContain('Classroom');
      button('Cancel this class').click();
      const seen = await settle();
      expect(seen.some((request) => request.request.url === `${CLASS_URL}/cancellation-quote`)).toBe(true);
      expect(text()).toContain('Learners affected');
    });
  });

  describe('start class', () => {
    it('explains why starting from the platform matters', async () => {
      await open();
      expect(text()).toContain('it is what records that you showed up');
    });

    it('starts the class and offers the room as a link to open in a new tab, keeping it out of storage', async () => {
      const opened = vi.spyOn(window, 'open').mockReturnValue(null);
      const stored = vi.spyOn(Storage.prototype, 'setItem');
      await open();
      button('Start class').click();
      const seen = await settle([
        {
          url: `${CLASS_URL}/start`,
          method: 'POST',
          reply: { sessionId: 's-1', role: 'Tutor', meetUrl: MEET_URL, startsAtUtc: 'a', endsAtUtc: 'b', serverTimeUtc: 'c' },
        },
      ]);
      expect(seen.some((request) => request.request.url === `${CLASS_URL}/start` && request.request.method === 'POST')).toBe(true);
      const link = [...page().querySelectorAll('a')].find((a) => a.textContent?.includes('Open the room'))!;
      expect(link.getAttribute('href')).toBe(MEET_URL);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(opened).toHaveBeenCalledWith(MEET_URL, '_blank', 'noopener,noreferrer');
      // The room link is a capability: it is never written to local or session storage.
      expect(stored.mock.calls.some(([, value]) => String(value).includes('meet.google.com'))).toBe(false);
    });

    it('shows when the class opens when it is started too early', async () => {
      await open();
      button('Start class').click();
      await settle([
        {
          url: `${CLASS_URL}/start`,
          method: 'POST',
          status: 409,
          reply: { status: 409, reason: 'tutoring.window_not_open', opensAtUtc: '2026-10-20T01:45:00Z', serverTimeUtc: '2026-10-20T00:00:00Z' },
        },
      ]);
      expect(text()).toContain('It is not time to start this class yet.');
      expect(text()).toContain('You can start at');
      expect(text()).toContain('08:45');
    });

    it('looks at the room again when the server says it is not ready', async () => {
      await open();
      button('Start class').click();
      const seen = await settle([
        { url: `${CLASS_URL}/start`, method: 'POST', status: 503, reply: { status: 503, reason: 'tutoring.room_not_ready', needsAction: 'Waiting' } },
      ]);
      expect(text()).toContain('The classroom is not ready yet');
      expect(seen.filter((request) => request.request.url === `${CLASS_URL}/room`).length).toBeGreaterThan(0);
    });
  });

  describe('room', () => {
    const pasteRoom = roomStatus({ state: 'AwaitingLink', needsAction: 'PasteLink', isUsable: false, hasMeetingLink: false });

    it('guides the tutor to connect Google or paste a link when Google is not connected', async () => {
      await open([{ url: `${CLASS_URL}/room`, method: 'GET', reply: pasteRoom }]);
      expect(text()).toContain('Google Calendar is not connected');
      expect(text()).toContain('Set up the room yourself in 2 steps');
      const settings = [...page().querySelectorAll('a')].find((a) => a.textContent?.includes('Google connection settings'))!;
      expect(settings.getAttribute('href')).toBe('/instructor/live-settings');
    });

    it('refuses a link that is not https without calling the server, then saves a good one and clears the field', async () => {
      await open([{ url: `${CLASS_URL}/room`, method: 'GET', reply: pasteRoom }]);
      const field = page().querySelector<HTMLInputElement>('app-class-room-card input[type=url]')!;
      await type(field, 'http://meet.google.com/abc', [{ url: `${CLASS_URL}/room`, method: 'GET', reply: pasteRoom }]);
      button('Save link').click();
      await settle([{ url: `${CLASS_URL}/room`, method: 'GET', reply: pasteRoom }]);
      expect(text()).toContain('Paste a link that starts with https://');

      await type(field, MEET_URL, [{ url: `${CLASS_URL}/room`, method: 'GET', reply: pasteRoom }]);
      button('Save link').click();
      const seen = await settle([
        { url: `${CLASS_URL}/meeting-link`, method: 'PUT', reply: roomStatus() },
        { url: `${CLASS_URL}/room`, method: 'GET', reply: roomStatus() },
      ]);
      const put = seen.find((request) => request.request.method === 'PUT')!;
      expect(put.request.body).toEqual({ meetUrl: MEET_URL });
      expect(field.value).toBe('');
    });

    it('offers to reconnect Google and sends the browser to Google\'s own consent address only', async () => {
      await open([{ url: `${CLASS_URL}/room`, method: 'GET', reply: roomStatus({ state: 'NeedsReconnect', needsAction: 'ReconnectGoogle', isUsable: false }) }]);
      button('Reconnect Google').click();
      await settle([
        { url: `${CLASS_URL}/room`, method: 'GET', reply: roomStatus({ state: 'NeedsReconnect', needsAction: 'ReconnectGoogle', isUsable: false }) },
        { url: '/api/live/instructor/google/connect', reply: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' } },
      ]);
      expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    });

    it('retries the room when the server asks for it', async () => {
      await open([{ url: `${CLASS_URL}/room`, method: 'GET', reply: roomStatus({ state: 'Failed', needsAction: 'Retry', isUsable: false }) }]);
      button('Try creating the room again').click();
      const seen = await settle([
        { url: `${CLASS_URL}/room/retry`, method: 'POST', reply: {} },
        { url: `${CLASS_URL}/room`, method: 'GET', reply: roomStatus({ state: 'Pending', needsAction: 'Waiting', isUsable: false }) },
      ]);
      expect(seen.some((request) => request.request.url === `${CLASS_URL}/room/retry`)).toBe(true);
      expect(text()).toContain('Creating the classroom');
    });
  });

  describe('complete the class', () => {
    const topics = (): HTMLTextAreaElement => page().querySelector<HTMLTextAreaElement>('app-class-summary-card textarea')!;

    it('requires what was covered before anything is sent', async () => {
      await open();
      button('Complete class and send summary').click();
      await settle();
      expect(text()).toContain('This field is required.');
      expect(text()).not.toContain('Complete this class?');
    });

    it('asks for a confirmation, then completes with the summary and per-learner feedback', async () => {
      await open();
      await type(topics(), '  Quadratics ');
      const feedbackBox = page().querySelectorAll<HTMLTextAreaElement>('app-class-summary-card textarea')[3];
      await type(feedbackBox, 'Good effort');
      button('Complete class and send summary').click();
      await settle();
      expect(text()).toContain('Complete this class?');

      buttons().find((b) => b.textContent?.trim() === 'Complete class' && b.closest('[role=dialog]'))!.click();
      const seen = await settle([
        {
          url: `${CLASS_URL}/complete`,
          method: 'POST',
          reply: { sessionId: 's-1', status: 'Completed', alreadyCompleted: false, completedBookings: 1, noShowLearnerBookings: 0, pendingBookings: 0 },
        },
      ]);
      const post = seen.find((request) => request.request.url === `${CLASS_URL}/complete`)!;
      expect(post.request.body).toEqual({
        topicsCovered: 'Quadratics',
        homework: null,
        nextSteps: null,
        learnerFeedback: [{ bookingId: 'b-1', feedback: 'Good effort' }],
      });
      expect(text()).toContain('Recorded as attended: 1');
    });

    it('shows when the class can be completed if it is too early', async () => {
      await open();
      await type(topics(), 'Quadratics');
      button('Complete class and send summary').click();
      await settle();
      buttons().find((b) => b.textContent?.trim() === 'Complete class' && b.closest('[role=dialog]'))!.click();
      await settle([
        {
          url: `${CLASS_URL}/complete`,
          method: 'POST',
          status: 409,
          reply: { status: 409, reason: 'tutoring.complete_too_early', opensAtUtc: '2026-10-20T02:50:00Z' },
        },
      ]);
      expect(text()).toContain('You cannot complete this class yet');
      expect(text()).toContain('You can complete from');
      expect(text()).toContain('09:50');
    });

    it('edits the stored summary of a completed class with PUT, filling the form first', async () => {
      const completed = attendance({ status: 'Completed', learners: [classLearner({ status: 'Completed' })] });
      const summary = { sessionId: 's-1', topicsCovered: 'Old topic', homework: 'HW', nextSteps: null, learners: [{ bookingId: 'b-1', nickname: 'Nok', feedback: 'Nice' }] };
      await open([
        { url: `${CLASS_URL}/attendance`, reply: completed },
        { url: `${CLASS_URL}/summary`, method: 'GET', reply: summary },
      ]);
      expect(topics().value).toBe('Old topic');
      await type(topics(), 'New topic', [
        { url: `${CLASS_URL}/attendance`, reply: completed },
        { url: `${CLASS_URL}/summary`, method: 'GET', reply: summary },
      ]);
      button('Save summary').click();
      const seen = await settle([
        { url: `${CLASS_URL}/attendance`, reply: completed },
        { url: `${CLASS_URL}/summary`, method: 'PUT', reply: {} },
      ]);
      const put = seen.find((request) => request.request.method === 'PUT')!;
      expect(put.request.body).toMatchObject({ topicsCovered: 'New topic', homework: 'HW', learnerFeedback: [{ bookingId: 'b-1', feedback: 'Nice' }] });
    });

    it('writes a missing summary of a class the system closed through complete (which upserts), not through the edit route', async () => {
      const completed = attendance({ status: 'Completed', learners: [classLearner({ status: 'Completed' })] });
      const none = { sessionId: 's-1', topicsCovered: null, homework: null, nextSteps: null, learners: [] };
      const base: readonly Route[] = [
        { url: `${CLASS_URL}/attendance`, reply: completed },
        { url: `${CLASS_URL}/summary`, method: 'GET', reply: none },
      ];
      await open(base);
      await type(topics(), 'First summary', base);
      button('Save summary').click();
      const seen = await settle([
        ...base,
        {
          url: `${CLASS_URL}/complete`,
          method: 'POST',
          reply: { sessionId: 's-1', status: 'Completed', alreadyCompleted: true, completedBookings: 1, noShowLearnerBookings: 0, pendingBookings: 0 },
        },
      ]);
      expect(seen.some((request) => request.request.url === `${CLASS_URL}/complete` && request.request.method === 'POST')).toBe(true);
      expect(seen.some((request) => request.request.method === 'PUT')).toBe(false);
    });
  });

  describe('materials', () => {
    it('adds a link after checking it is https, and removes a material', async () => {
      const existing = { id: 'm-1', kind: 'Link', title: 'Old notes', url: 'https://example.com/old', bodyText: null, fileName: null, contentType: null, sizeBytes: null, addedAtUtc: '2026-10-14T05:00:00Z' };
      await open([{ url: MATERIALS_URL, method: 'GET', reply: [existing] }]);
      expect(text()).toContain('Old notes');
      const anchor = [...page().querySelectorAll('a')].find((a) => a.textContent?.includes('https://example.com/old'))!;
      expect(anchor.getAttribute('rel')).toContain('nofollow');
      expect(anchor.getAttribute('rel')).toContain('noopener');

      const [title, url] = page().querySelectorAll<HTMLInputElement>('app-class-materials-card input');
      await type(title, 'Worksheet', [{ url: MATERIALS_URL, method: 'GET', reply: [existing] }]);
      await type(url, 'http://insecure.example', [{ url: MATERIALS_URL, method: 'GET', reply: [existing] }]);
      button('Add material').click();
      await settle([{ url: MATERIALS_URL, method: 'GET', reply: [existing] }]);
      expect(text()).toContain('Enter a link that starts with https://');

      await type(url, 'https://example.com/w.pdf', [{ url: MATERIALS_URL, method: 'GET', reply: [existing] }]);
      button('Add material').click();
      const seen = await settle([
        { url: `${CLASS_URL}/materials`, method: 'POST', reply: { ...existing, id: 'm-2' } },
        { url: MATERIALS_URL, method: 'GET', reply: [existing] },
      ]);
      expect(seen.find((request) => request.request.method === 'POST')!.request.body).toEqual({
        kind: 'Link',
        title: 'Worksheet',
        url: 'https://example.com/w.pdf',
        bodyText: null,
      });

      buttonStarting('Delete').click();
      const removed = await settle([
        { url: `${CLASS_URL}/materials/m-1`, method: 'DELETE', status: 204 },
        { url: MATERIALS_URL, method: 'GET', reply: [] },
      ]);
      expect(removed.some((request) => request.request.method === 'DELETE')).toBe(true);
      expect(text()).toContain('No materials yet.');
    });

    it('withdraws the file upload for the visit when the server says files are switched off', async () => {
      await open();
      expect(text()).toContain('Attach a file');
      const input = page().querySelector<HTMLInputElement>('app-class-materials-card input[type=file]')!;
      const file = new File(['%PDF'], 'sheet.pdf', { type: 'application/pdf' });
      Object.defineProperty(input, 'files', { value: { 0: file, length: 1, item: () => file } });
      input.dispatchEvent(new Event('change'));
      await settle([
        {
          url: `${CLASS_URL}/materials`,
          method: 'POST',
          status: 503,
          reply: { status: 503, reason: 'tutoring.materials_files_disabled' },
        },
      ]);
      expect(text()).toContain('File attachments are not switched on yet');
      expect(page().querySelector('app-class-materials-card input[type=file]')).toBeNull();
    });
  });

  describe('cancel', () => {
    const openDialog = async (quote = cancellationQuote()): Promise<void> => {
      await open([{ url: `${CLASS_URL}/cancellation-quote`, reply: quote }]);
      button('Cancel this class').click();
      await settle([{ url: `${CLASS_URL}/cancellation-quote`, reply: quote }]);
    };

    it('shows the server\'s cancellation quote before anything is confirmed', async () => {
      await openDialog();
      const dialog = page().querySelector('[role=dialog]')!.textContent ?? '';
      expect(dialog).toContain('Learners affected');
      expect(dialog).toContain('900.00');
      expect(dialog).toContain('Late cancellation (5 points)');
      expect(dialog).toContain('92 becomes 87');
      expect(dialog).not.toContain('suspended');
    });

    it('warns loudly when cancelling would suspend the account', async () => {
      await openDialog(cancellationQuote({ willTriggerSuspension: true }));
      expect(page().querySelector('[role=dialog] [role=alert]')?.textContent).toContain('your tutor account will be suspended');
    });

    it('explains a refusal and offers no confirm button', async () => {
      await openDialog(cancellationQuote({ canCancel: false, refusalReason: 'cancel_after_end' }));
      expect(page().querySelector('[role=dialog]')!.textContent).toContain('already ended');
      expect(button('Confirm cancellation')).toBeUndefined();
    });

    it('explains the bare `after_end` refusal code of the tutor quote in the same words', async () => {
      await openDialog(cancellationQuote({ canCancel: false, refusalReason: 'after_end' }));
      expect(page().querySelector('[role=dialog]')!.textContent).toContain('already ended');
      expect(button('Confirm cancellation')).toBeUndefined();
    });

    it('needs a reason, sends only the reason and shows the receipt', async () => {
      await openDialog();
      button('Confirm cancellation').click();
      await settle();
      expect(page().querySelector('[role=dialog]')!.textContent).toContain('This field is required.');

      const reason = page().querySelector<HTMLTextAreaElement>('[role=dialog] textarea')!;
      await type(reason, 'Family emergency');
      button('Confirm cancellation').click();
      const seen = await settle([
        {
          url: `${CLASS_URL}/cancel`,
          method: 'POST',
          reply: {
            sessionId: 's-1',
            status: 'Cancelled',
            alreadyCancelled: false,
            bookings: [{ bookingId: 'b-1', bookingNo: 'TB-1001', refundAmount: 450, settlement: 'Money', refundStatus: 'Requested' }],
            penaltyKind: 'LateCancel',
            penaltyPoints: 5,
            reliabilityScore: 87,
            suspended: false,
          },
        },
        { url: `${CLASS_URL}/attendance`, reply: attendance({ status: 'Cancelled' }) },
      ]);
      expect(seen.find((request) => request.request.url === `${CLASS_URL}/cancel`)!.request.body).toEqual({ reason: 'Family emergency' });
      const dialog = page().querySelector('[role=dialog]')!.textContent ?? '';
      expect(dialog).toContain('The class is cancelled and the learners have been told.');
      expect(dialog).toContain('Booking TB-1001');
      expect(dialog).toContain('Your reliability score is now 87');
    });
  });
});
