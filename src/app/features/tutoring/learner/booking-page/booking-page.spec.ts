import { Component } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { LearnerProfile } from '../../data/tutoring-learner.models';
import type { TutorPublicProfile } from '../../data/tutoring-public.models';
import { booking, learnerProfile, pagedOf, publicTutor, slotsResponse } from '../testing/learner-fixtures';
import { BookingPage } from './booking-page';

@Component({ selector: 'app-checkout-stub', template: '' })
class CheckoutStub {}

const TUTOR_URL = '/api/tutoring/tutors/nina-tutor';
const PROFILES_URL = '/api/tutoring/learner-profiles';
const POLICY_URL = '/api/tutoring/cancellation-policy';
const BOOKINGS_URL = '/api/tutoring/bookings';
/** 2026-10-20T11:00Z is 18:00 on Tuesday 20 Oct in Bangkok. */
const SLOT_START = '2026-10-20T11:00:00Z';
const PRESELECTED = `/tutors/nina-tutor/book?offeringId=off-physics&startsAtUtc=${SLOT_START}&durationMinutes=60&format=OneOnOne`;

describe('BookingPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tutors/:slug/book', component: BookingPage },
          { path: 'tutoring/checkout/:bookingId', component: CheckoutStub },
        ]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.tick();
    await Promise.resolve();
    harness.detectChanges();
  }

  const slotsRequests = (): TestRequest[] => httpMock.match((req) => req.url.endsWith('/slots'));

  interface OpenOptions {
    readonly url?: string;
    readonly tutor?: TutorPublicProfile;
    readonly profiles?: readonly LearnerProfile[];
    readonly slots?: readonly string[];
  }

  /** Opens the booking page and answers its first requests like a healthy server. */
  async function open(options: OpenOptions = {}): Promise<void> {
    await harness.navigateByUrl(options.url ?? PRESELECTED, BookingPage);
    await settle();
    httpMock.expectOne(TUTOR_URL).flush(options.tutor ?? publicTutor());
    httpMock.expectOne(POLICY_URL).flush({
      fullRefundHours: 24,
      fullRefundPercent: 100,
      lateRefundPercent: 50,
      tutorCancelRefundPercent: 100,
      tutorNoShowRefundPercent: 100,
      learnerNoShowRefundPercent: 0,
      disputeWindowHours: 24,
    });
    await settle();
    httpMock.expectOne((req) => req.url === PROFILES_URL).flush(pagedOf(options.profiles ?? [learnerProfile()]));
    await settle();
    await settle();
    const requests = slotsRequests();
    expect(requests).toHaveLength(1);
    requests[0].flush(slotsResponse(options.slots ?? [SLOT_START, '2026-10-20T12:00:00Z']));
    await settle();
    await settle();
  }

  const reserveButton = (): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll('aside app-button')).find((host) => host.textContent?.includes('Reserve') || host.textContent?.includes('Book free'))?.querySelector('button') ?? null;
  const alert = (): string => root().querySelector('aside [role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const summary = (): string => root().querySelector('aside')?.textContent?.replace(/\s+/g, ' ') ?? '';

  it('shows the tutor, a breadcrumb, and asks the server for the pre-selected lesson (offering, length, format)', async () => {
    await harness.navigateByUrl(PRESELECTED, BookingPage);
    await settle();
    httpMock.expectOne(TUTOR_URL).flush(publicTutor());
    httpMock.expectOne(POLICY_URL).flush({ fullRefundHours: 24, fullRefundPercent: 100, lateRefundPercent: 50, tutorCancelRefundPercent: 100, tutorNoShowRefundPercent: 100, learnerNoShowRefundPercent: 0, disputeWindowHours: 24 });
    await settle();
    httpMock.expectOne((req) => req.url === PROFILES_URL).flush(pagedOf([learnerProfile()]));
    await settle();
    await settle();

    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Book a lesson with Nina Tutor');
    expect(root().querySelector('nav[aria-label]')?.textContent).toContain('Nina Tutor');
    const [request] = slotsRequests();
    expect(request.request.params.get('offeringId')).toBe('off-physics');
    expect(request.request.params.get('durationMinutes')).toBe('60');
    expect(request.request.params.get('format')).toBe('OneOnOne');
    request.flush(slotsResponse([SLOT_START]));
    await settle();
  });

  it('keeps the pre-selected time when the server still offers it, and shows the server price and Bangkok time', async () => {
    await open();

    expect(summary()).toContain('Tue 20 Oct, 18:00-19:00');
    expect(summary()).toContain('฿450.00');
    expect(summary()).toContain('Nina Tutor');
    expect(summary()).toContain('Mint');
    expect(reserveButton()?.disabled).toBe(false);
  });

  it('drops the pre-selection and says so when the server no longer offers that time', async () => {
    await open({ slots: ['2026-10-20T12:00:00Z'] });

    expect(text()).toContain('The time you chose earlier is no longer available');
    expect(summary()).toContain('None yet');
    expect(reserveButton()?.disabled).toBe(true);
  });

  it('ignores a pre-selection that does not fit the tutor (group format on an offering without groups)', async () => {
    await harness.navigateByUrl('/tutors/nina-tutor/book?offeringId=off-math&format=Group&trial=true&durationMinutes=999', BookingPage);
    await settle();
    httpMock.expectOne(TUTOR_URL).flush(publicTutor());
    httpMock.expectOne(POLICY_URL).flush({ fullRefundHours: 24, fullRefundPercent: 100, lateRefundPercent: 50, tutorCancelRefundPercent: 100, tutorNoShowRefundPercent: 100, learnerNoShowRefundPercent: 0, disputeWindowHours: 24 });
    await settle();
    httpMock.expectOne((req) => req.url === PROFILES_URL).flush(pagedOf([learnerProfile()]));
    await settle();
    await settle();

    const [request] = slotsRequests();
    expect(request.request.params.get('offeringId')).toBe('off-math');
    expect(request.request.params.get('format')).toBe('OneOnOne');
    expect(request.request.params.get('durationMinutes')).toBe('60');
    expect(request.request.params.has('trial')).toBe(false);
    request.flush(slotsResponse([]));
    await settle();
  });

  it('offers the lesson lengths the tutor profile allows, and starts on a pre-selected length only if it is one of them', async () => {
    await harness.navigateByUrl(`/tutors/nina-tutor/book?offeringId=off-physics&durationMinutes=60`, BookingPage);
    await settle();
    httpMock.expectOne(TUTOR_URL).flush(publicTutor({ allowedDurationMinutes: [45, 90] }));
    httpMock.expectOne(POLICY_URL).flush({ fullRefundHours: 24, fullRefundPercent: 100, lateRefundPercent: 50, tutorCancelRefundPercent: 100, tutorNoShowRefundPercent: 100, learnerNoShowRefundPercent: 0, disputeWindowHours: 24 });
    await settle();
    httpMock.expectOne((req) => req.url === PROFILES_URL).flush(pagedOf([learnerProfile()]));
    await settle();
    await settle();

    const select = Array.from(root().querySelectorAll('label'))
      .filter((label) => label.textContent?.includes('Lesson length'))
      .map((label) => root().querySelector<HTMLSelectElement>(`#${label.getAttribute('for')}`)!)[0];
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['45', '90']);
    const [request] = slotsRequests();
    expect(request.request.params.get('durationMinutes')).toBe('45');
    request.flush(slotsResponse([]));
    await settle();
  });

  it('picks the only learner for the person', async () => {
    await open();

    expect(summary()).toContain('Mint');
    expect(root().querySelector<HTMLSelectElement>('app-learner-profile-picker app-select select')?.value).toBe('lp-1');
  });

  it('requires an explicit learner choice when the account has several (a wrong default would book the wrong child)', async () => {
    await open({ profiles: [learnerProfile(), learnerProfile({ learnerProfileId: 'lp-2', nickname: 'Pim', gradeLevel: 'Adult', isMinor: false })] });

    expect(reserveButton()?.disabled).toBe(true);
    expect(text()).toContain('Choose a time and a learner to continue');

    const select = root().querySelector<HTMLSelectElement>('app-learner-profile-picker app-select select');
    if (select === null) {
      throw new Error('learner select missing');
    }
    select.value = 'lp-2';
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(summary()).toContain('Pim');
    expect(reserveButton()?.disabled).toBe(false);
  });

  it('opens the inline add-learner form straight away when the account has no learner yet, with no cancel button', async () => {
    await open({ profiles: [] });

    expect(root().querySelector('app-learner-profile-form')).not.toBeNull();
    expect(Array.from(root().querySelectorAll('app-learner-profile-form app-button')).some((host) => host.textContent?.includes('Cancel'))).toBe(false);
    expect(reserveButton()?.disabled).toBe(true);
  });

  it('selects a learner created inline without leaving the page', async () => {
    await open({ profiles: [] });
    const form = root().querySelector('app-learner-profile-form');
    const nickname = form?.querySelector<HTMLInputElement>('app-input input');
    if (nickname) {
      nickname.value = 'Mint';
      nickname.dispatchEvent(new Event('input'));
    }
    Array.from(form?.querySelectorAll('app-checkbox') ?? []).find((host) => host.textContent?.includes('parent or guardian'))?.querySelector('input')?.click();
    await settle();
    form?.querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();

    httpMock.expectOne(PROFILES_URL).flush(learnerProfile(), { status: 201, statusText: 'Created' });
    await settle();
    httpMock.expectOne((req) => req.url === PROFILES_URL).flush(pagedOf([learnerProfile()]));
    await settle();
    await settle();

    expect(root().querySelector('app-learner-profile-form')).toBeNull();
    expect(summary()).toContain('Mint');
    expect(reserveButton()?.disabled).toBe(false);
  });

  it('holds the slot with ids and the chosen time only, then continues to the checkout of the new booking', async () => {
    await open();

    reserveButton()?.click();
    await settle();
    const request = httpMock.expectOne(BOOKINGS_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      offeringId: 'off-physics',
      startsAtUtc: SLOT_START,
      durationMinutes: 60,
      format: 'OneOnOne',
      learnerProfileId: 'lp-1',
      isTrial: false,
    });
    request.flush(booking(), { status: 201, statusText: 'Created' });
    await settle();
    // The navigation is fire-and-forget in the page: give the router a macrotask to finish it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(router.url).toBe('/tutoring/checkout/b-1');
  });

  it('ignores a second click while the booking call is in flight (double-submit guard)', async () => {
    await open();

    reserveButton()?.click();
    await settle();
    reserveButton()?.click();
    await settle();

    const requests = httpMock.match(BOOKINGS_URL);
    expect(requests).toHaveLength(1);
    requests[0].flush(booking(), { status: 201, statusText: 'Created' });
    await settle();
    await settle();
  });

  it('shows the cancellation policy from the server and never a number of its own', async () => {
    await open();

    expect(summary()).toContain('Cancel at least 24 hours before the lesson for 100% back; later cancellations get 50% back.');
  });

  describe('when the server refuses the booking', () => {
    async function refuse(reason: string, extra: object = {}, status = 409): Promise<void> {
      reserveButton()?.click();
      await settle();
      httpMock
        .expectOne(BOOKINGS_URL)
        .flush({ title: 'Conflict', status, errorCode: 'conflict', reason, ...extra }, { status, statusText: 'Conflict' });
      await settle();
      await settle();
    }

    it('slot_taken: says so, forgets the time and re-reads the calendar so the person can pick again', async () => {
      await open();

      await refuse('tutoring.slot_taken');

      expect(alert()).toBe('Someone just booked that time. Please pick another one.');
      expect(summary()).toContain('None yet');
      expect(reserveButton()?.disabled).toBe(true);
      const requests = slotsRequests();
      expect(requests).toHaveLength(1);
      requests[0].flush(slotsResponse(['2026-10-20T12:00:00Z']));
      await settle();
    });

    it('trial_already_used: drops the trial so the next try is a regular lesson', async () => {
      await open({ url: `/tutors/nina-tutor/book?offeringId=off-physics&startsAtUtc=${SLOT_START}&trial=true`, slots: [SLOT_START] });

      await refuse('tutoring.trial_already_used');

      expect(alert()).toContain('already had a trial lesson with this tutor');
      const [request] = slotsRequests();
      expect(request.request.params.has('trial')).toBe(false);
      request.flush(slotsResponse([SLOT_START]));
      await settle();
    });

    it('slot_already_held_by_you: offers the checkout of the booking that already holds the time', async () => {
      await open();

      await refuse('tutoring.slot_already_held_by_you', { bookingId: 'b-held' });

      expect(alert()).toContain('already holding this time');
      const link = root().querySelector('aside a[href="/tutoring/checkout/b-held"], aside app-button[ng-reflect-router-link]');
      expect(link ?? Array.from(root().querySelectorAll('aside app-button')).find((host) => host.textContent?.includes('Continue to payment'))).not.toBeNull();
    });

    it('learner_profile_not_found: clears the learner and reads the profiles again', async () => {
      await open();

      await refuse('tutoring.learner_profile_not_found', {}, 404);

      expect(alert()).toContain('learner profile could not be found');
      httpMock.expectOne((req) => req.url === PROFILES_URL).flush(pagedOf([]));
      await settle();
    });

    it('too_many_pending_holds: explains what to do', async () => {
      await open();

      await refuse('tutoring.too_many_pending_holds');

      expect(alert()).toContain('Finish paying for them, or wait for them to expire');
      expect(reserveButton()?.disabled).toBe(false);
    });

    it('a rate limit (429) is explained without a reason code', async () => {
      await open();
      reserveButton()?.click();
      await settle();

      httpMock.expectOne(BOOKINGS_URL).flush(null, { status: 429, statusText: 'Too Many Requests' });
      await settle();

      expect(alert()).toContain('Too many requests');
    });
  });

  it('shows a not-found state with a way forward when the tutor is not public', async () => {
    await harness.navigateByUrl('/tutors/nina-tutor/book', BookingPage);
    await settle();
    httpMock.expectOne(TUTOR_URL).flush({ title: 'x', reason: 'tutoring.tutor_not_found' }, { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(POLICY_URL).flush(null, { status: 500, statusText: 'x' });
    await settle();
    await settle();

    expect(text()).toContain('This tutor is not available');
    expect(slotsRequests()).toHaveLength(0);
  });

  it('shows an error with a retry when the tutor cannot be loaded', async () => {
    await harness.navigateByUrl('/tutors/nina-tutor/book', BookingPage);
    await settle();
    httpMock.expectOne(TUTOR_URL).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(POLICY_URL).flush(null, { status: 500, statusText: 'x' });
    await settle();
    await settle();

    expect(text()).toContain('Could not load this page');
    Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes('Try again'))?.querySelector('button')?.click();
    await settle();
    httpMock.expectOne(TUTOR_URL).flush(publicTutor());
    await settle();
    httpMock.expectOne((req) => req.url === PROFILES_URL).flush(pagedOf([learnerProfile()]));
    await settle();
    await settle();
    slotsRequests().forEach((request) => request.flush(slotsResponse([])));
    await settle();

    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Book a lesson with Nina Tutor');
  });
});
