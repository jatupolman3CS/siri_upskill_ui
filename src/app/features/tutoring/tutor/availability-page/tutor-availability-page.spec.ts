import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { pagedOf, tutorOffering, tutorProfile } from '../testing/tutor-fixtures';
import { type Route, availability, paged, respond, settleWith } from '../testing/tutor-ops-fixtures';
import { TutorAvailabilityPage } from './tutor-availability-page';

registerLocaleData(localeTh);

const AVAILABILITY_URL = '/api/tutoring/tutor/availability';
const SLOTS_URL = '/api/tutoring/tutors/nina-tutor/slots';

const SLOTS_RESPONSE = {
  tutorSlug: 'nina-tutor',
  offeringId: 'off-1',
  format: 'OneOnOne',
  durationMinutes: 60,
  isTrial: false,
  quote: { amount: 450, currency: 'THB', durationMinutes: 60, hourlyRate: 450, isFree: false },
  timezone: 'Asia/Bangkok',
  serverTimeUtc: '2026-10-15T01:00:00Z',
  fromUtc: '2026-10-15T00:00:00Z',
  toUtc: '2026-10-22T00:00:00Z',
  minNoticeHours: 24,
  maxAdvanceDays: 60,
  slots: [],
};

describe('TutorAvailabilityPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/availability', component: TutorAvailabilityPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  const buttons = (): HTMLButtonElement[] => [...page().querySelectorAll('button')];
  const button = (label: string): HTMLButtonElement => buttons().find((b) => b.textContent?.trim() === label)!;

  function baseRoutes(overrides: readonly Route[] = [], profile: Partial<ReturnType<typeof tutorProfile>> = {}): readonly Route[] {
    return [
      ...overrides,
      { url: AVAILABILITY_URL, method: 'GET', reply: availability() },
      { url: '/api/tutoring/tutor/profile', reply: tutorProfile({ status: 'Verified', isListed: true, ...profile }) },
      { url: '/api/tutoring/tutor/offerings', reply: pagedOf([tutorOffering()]) },
      { url: `${AVAILABILITY_URL}/exceptions`, method: 'GET', reply: paged([]) },
      { url: SLOTS_URL, reply: SLOTS_RESPONSE },
    ];
  }

  async function open(routes: readonly Route[] = baseRoutes()) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/availability', TutorAvailabilityPage);
    return settleWith(harness, httpMock, routes);
  }

  async function settle(routes: readonly Route[] = baseRoutes()) {
    return settleWith(harness, httpMock, routes);
  }

  function addWindowFor(day: string): void {
    [...page().querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Add hours') && b.textContent.includes(day))!
      .click();
  }

  async function pickTime(selectIndex: number, value: string): Promise<void> {
    const select = page().querySelectorAll<HTMLSelectElement>('app-weekly-rules-editor select')[selectIndex];
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  it('shows the stored weekly hours, the booking rules and asks the public slot list what learners see (60 min, no format)', async () => {
    const seen = await open();
    expect(text()).toContain('Weekly teaching hours');
    expect(text()).toContain('1 of 50 windows');
    const selects = page().querySelectorAll<HTMLSelectElement>('app-weekly-rules-editor select');
    expect(selects[0].value).toBe('09:00');
    expect(selects[1].value).toBe('12:00');
    const numbers = page().querySelectorAll<HTMLInputElement>('app-availability-settings-form input[type=number]');
    expect(numbers[0].value).toBe('24');
    expect(numbers[1].value).toBe('60');

    const slots = seen.find((request) => request.request.url === SLOTS_URL)!;
    expect(slots.request.params.get('offeringId')).toBe('off-1');
    expect(slots.request.params.get('durationMinutes')).toBe('60');
    expect(slots.request.params.has('format')).toBe(false);
    expect(slots.request.params.has('trial')).toBe(false);
  });

  it('offers exactly the rest lengths and class lengths the server lists - not the platform defaults', async () => {
    const server = availability({
      settings: { minNoticeHours: 24, bufferMinutes: 20, maxAdvanceDays: 60, rowVersion: 'AAAAAAAAB9E=' },
      allowedDurationMinutes: [45, 90],
      allowedBufferMinutes: [0, 20, 40],
    });
    const seen = await open([{ url: AVAILABILITY_URL, method: 'GET', reply: server }, ...baseRoutes()]);

    const values = (selector: string): string[] => [...page().querySelectorAll<HTMLOptionElement>(`${selector} option`)].map((o) => o.value);
    expect(values('app-availability-settings-form select')).toEqual(['0', '20', '40']);
    expect(page().querySelector<HTMLSelectElement>('app-availability-settings-form select')!.value).toBe('20');
    // The preview's subject picker comes first; the class-length picker is the one whose options are lengths.
    expect(values('app-availability-preview select').filter((value) => /^\d+$/.test(value))).toEqual(['45', '90']);

    const slots = seen.filter((request) => request.request.url === SLOTS_URL);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((request) => request.request.params.get('durationMinutes') === '45')).toBe(true);
  });

  it('hands the preview the booking horizon from the availability settings the page already holds', async () => {
    const nextWeek = (): HTMLButtonElement => page().querySelector<HTMLButtonElement>('app-availability-preview button[aria-label="Next week"]')!;

    await open([
      { url: AVAILABILITY_URL, method: 'GET', reply: availability({ settings: { minNoticeHours: 24, bufferMinutes: 10, maxAdvanceDays: 6, rowVersion: 'AAAAAAAAB9E=' } }) },
      ...baseRoutes(),
    ]);

    // The slot answer says 60 days; the page's own settings say 6, so there is no second week to page to - and nothing guessed.
    expect(nextWeek().disabled).toBe(true);
  });

  it('explains that learners see nothing yet when the profile is not listed, and does not call the public endpoint', async () => {
    const seen = await open(baseRoutes([], { isListed: false }));
    expect(seen.some((request) => request.request.url === SLOTS_URL)).toBe(false);
    expect(text()).toContain('not listed publicly');
  });

  it('saves the whole draft as one replace request, Monday first, and shows it as saved', async () => {
    await open();
    addWindowFor('Tuesday');
    await settle();
    expect(text()).toContain('You have unsaved changes');
    button('Save weekly hours').click();

    const routes = baseRoutes([
      {
        url: `${AVAILABILITY_URL}/rules`,
        method: 'PUT',
        replyWith: (request) => availability({ rules: (request.request.body as { rules: never[] }).rules }),
      },
    ]);
    const seen = await settle(routes);
    const put = seen.find((request) => request.request.url === `${AVAILABILITY_URL}/rules`)!;
    expect(put.request.body).toEqual({
      rules: [
        { dayOfWeek: 1, startLocal: '09:00', endLocal: '12:00' },
        { dayOfWeek: 2, startLocal: '09:00', endLocal: '12:00' },
      ],
    });
    expect(text()).toContain('Everything is saved');
    expect(text()).toContain('2 of 50 windows');
  });

  it('refuses to save windows that overlap, without calling the server', async () => {
    await open();
    addWindowFor('Monday');
    await settle();
    // The new Monday window follows the first (12:00-15:00); pull its start back to 11:00 so it overlaps 09:00-12:00.
    await pickTime(2, '11:00');
    expect(text()).toContain('overlaps another one');
    expect(button('Save weekly hours').disabled).toBe(true);
  });

  it('marks the window the server names by its index, with the server\'s own violation (the "violation" key, not "detail")', async () => {
    await open();
    addWindowFor('Tuesday');
    await settle();
    button('Save weekly hours').click();
    await settle(
      baseRoutes([
        {
          url: `${AVAILABILITY_URL}/rules`,
          method: 'PUT',
          status: 400,
          reply: { status: 400, errorCode: 'validation', reason: 'tutoring.availability_rule_invalid', index: 1, violation: 'grid' },
        },
      ]),
    );
    const alerts = [...page().querySelectorAll('app-weekly-rules-editor li [role=alert]')].map((el) => el.textContent?.trim());
    expect(alerts.some((message) => message?.includes('every 30 minutes'))).toBe(true);
    // Mapped to the second window of the request, i.e. Tuesday's - Monday's row carries no message.
    const monday = page().querySelector('app-weekly-rules-editor ul > li')!;
    expect(monday.querySelector('[role=alert]')).toBeNull();
    expect(text()).toContain('every 30 minutes');
  });

  it('sends the booking rules with the profile row version and adopts the new one', async () => {
    await open();
    const notice = page().querySelectorAll<HTMLInputElement>('app-availability-settings-form input[type=number]')[0];
    notice.value = '12';
    notice.dispatchEvent(new Event('input'));
    await settle();
    expect(button('Save booking rules').disabled).toBe(false);
    button('Save booking rules').click();

    const seen = await settle(
      baseRoutes([
        { url: `${AVAILABILITY_URL}/settings`, method: 'PUT', reply: { minNoticeHours: 12, bufferMinutes: 10, maxAdvanceDays: 60, rowVersion: 'AAAAAAAAB9I=' } },
      ]),
    );
    const put = seen.find((request) => request.request.url === `${AVAILABILITY_URL}/settings`)!;
    expect(put.request.body).toEqual({ minNoticeHours: 12, bufferMinutes: 10, maxAdvanceDays: 60, rowVersion: 'AAAAAAAAB9E=' });
    expect(text()).toContain('Everything is saved');
  });

  it('shows a range error on the field without calling the server', async () => {
    await open();
    const notice = page().querySelectorAll<HTMLInputElement>('app-availability-settings-form input[type=number]')[0];
    notice.value = '500';
    notice.dispatchEvent(new Event('input'));
    await settle();
    button('Save booking rules').click();
    await settle();
    expect(text()).toContain('Enter a number from 1 to 168.');
  });

  it('reloads everything when the profile changed under the tutor (stale row version)', async () => {
    await open();
    const notice = page().querySelectorAll<HTMLInputElement>('app-availability-settings-form input[type=number]')[0];
    notice.value = '12';
    notice.dispatchEvent(new Event('input'));
    await settle();
    button('Save booking rules').click();
    const seen = await settle(
      baseRoutes([
        {
          url: `${AVAILABILITY_URL}/settings`,
          method: 'PUT',
          status: 409,
          reply: { status: 409, errorCode: 'conflict', reason: 'tutoring.concurrent_update' },
        },
      ]),
    );
    expect(seen.filter((request) => request.request.url === AVAILABILITY_URL && request.request.method === 'GET').length).toBe(1);
  });

  it('adds a whole-day closure and removes an exception', async () => {
    await open(
      baseRoutes([
        {
          url: `${AVAILABILITY_URL}/exceptions`,
          method: 'GET',
          reply: paged([{ exceptionId: 'e-1', dateLocal: '2026-11-03', kind: 'Closed', startLocal: null, endLocal: null, note: 'Holiday' }]),
        },
      ]),
    );
    expect(text()).toContain('Closed all day');
    expect(text()).toContain('Holiday');

    buttons().find((b) => b.textContent?.trim().startsWith('Delete'))!.click();
    const removed = await settle(
      baseRoutes([
        { url: `${AVAILABILITY_URL}/exceptions/e-1`, method: 'DELETE', status: 204 },
        { url: `${AVAILABILITY_URL}/exceptions`, method: 'GET', reply: paged([]) },
      ]),
    );
    expect(removed.some((request) => request.request.method === 'DELETE' && request.request.url.endsWith('/exceptions/e-1'))).toBe(true);
    expect(text()).toContain('No days off or extra days yet');
  });

  it('validates a new exception on the form, then posts it', async () => {
    await open();
    button('Add').click();
    await settle();
    expect(text()).toContain('This field is required.');

    const date = page().querySelector<HTMLInputElement>('app-availability-exceptions input[type=date]')!;
    date.value = '2099-01-01';
    date.dispatchEvent(new Event('input'));
    await settle();
    expect(text()).toContain('at most 365 days ahead');

    date.value = '2026-12-24';
    date.dispatchEvent(new Event('input'));
    await settle();
    button('Add').click();
    const seen = await settle(
      baseRoutes([
        {
          url: `${AVAILABILITY_URL}/exceptions`,
          method: 'POST',
          status: 201,
          reply: { exceptionId: 'e-2', dateLocal: '2026-12-24', kind: 'Closed', startLocal: null, endLocal: null, note: null },
        },
      ]),
    );
    const post = seen.find((request) => request.request.method === 'POST')!;
    expect(post.request.body).toEqual({ dateLocal: '2026-12-24', kind: 'Closed', startLocal: null, endLocal: null, note: null });
  });

  it('says verification is needed when the availability call answers 403, and offers a retry on a server error', async () => {
    await open(baseRoutes([{ url: AVAILABILITY_URL, method: 'GET', status: 403, reply: { status: 403, errorCode: 'forbidden' } }]));
    expect(text()).toContain('Verification needed first');
    expect(text()).not.toContain('Weekly teaching hours');
  });

  it('shows an error state with a working retry when the availability cannot be loaded', async () => {
    await open(baseRoutes([{ url: AVAILABILITY_URL, method: 'GET', status: 500, reply: { status: 500 } }]));
    expect(text()).toContain('Could not load your availability');
    button('Try again').click();
    const seen = await settle();
    expect(seen.filter((request) => request.request.url === AVAILABILITY_URL).length).toBeGreaterThan(0);
    expect(text()).toContain('Weekly teaching hours');
  });
});

describe('respond helper', () => {
  it('fails loudly on a request nobody routed', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideHttpClientTesting()] });
    const httpMock = TestBed.inject(HttpTestingController);
    const { HttpClient } = await import('@angular/common/http');
    TestBed.inject(HttpClient).get('/api/unknown').subscribe();
    expect(() => respond(httpMock, [])).toThrow(/Unrouted request/);
  });
});
