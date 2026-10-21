import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Routes, provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { PublicOffering, TutorPublicProfile, TutorQuote, TutorSlot, TutorSlotsResponse } from '../../../data/tutoring-public.models';
import { TutorBookingPanel } from './tutor-booking-panel';

@Component({ template: '' })
class BookingStub {}

const PHYSICS: PublicOffering = {
  offeringId: 'off-physics',
  subject: { slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics' },
  level: 'UpperSecondary',
  curriculum: 'Thai',
  hourlyRateOneOnOne: 450,
  groupHourlyRatePerSeat: 250,
  groupMaxSeats: 4,
  trial: { minutes: 30, price: 0, isFree: true },
};
const MATH: PublicOffering = {
  offeringId: 'off-math',
  subject: { slug: 'math', nameTh: 'คณิตศาสตร์', nameEn: 'Mathematics' },
  level: 'Primary',
  curriculum: 'EP',
  hourlyRateOneOnOne: 300,
  groupHourlyRatePerSeat: null,
  groupMaxSeats: null,
  trial: null,
};

function profile(overrides: Partial<TutorPublicProfile> = {}): TutorPublicProfile {
  return {
    slug: 'nina-tutor',
    displayName: 'Nina Tutor',
    headline: null,
    bio: 'Bio',
    photoUrl: null,
    introVideo: null,
    gender: 'Female',
    yearsExperience: 5,
    ratingAverage: 0,
    ratingCount: 0,
    completedSessionsCount: 0,
    verified: true,
    verifiedAtUtc: '2026-01-01T00:00:00Z',
    minNoticeHours: 24,
    maxAdvanceDays: 30,
    nextAvailableAtUtc: null,
    timezone: 'Asia/Bangkok',
    allowedDurationMinutes: [30, 60, 90, 120],
    offerings: [PHYSICS, MATH],
    educations: [],
    certificates: [],
    ...overrides,
  };
}

const WED_0900: TutorSlot = { startsAtUtc: '2026-10-14T02:00:00Z', endsAtUtc: '2026-10-14T03:00:00Z', seatsLeft: 1, joinsExistingGroup: false };
const WED_1000: TutorSlot = { startsAtUtc: '2026-10-14T03:00:00Z', endsAtUtc: '2026-10-14T04:00:00Z', seatsLeft: 1, joinsExistingGroup: false };

function quote(amount: number, durationMinutes = 60, extra: Partial<TutorQuote> = {}): TutorQuote {
  return { amount, currency: 'THB', durationMinutes, hourlyRate: 450, isFree: false, ...extra };
}

function slotsBody(slots: TutorSlot[], q: TutorQuote = quote(450), extra: Partial<TutorSlotsResponse> = {}): TutorSlotsResponse {
  return {
    tutorSlug: 'nina-tutor',
    offeringId: 'off-physics',
    format: 'OneOnOne',
    durationMinutes: q.durationMinutes,
    isTrial: false,
    quote: q,
    timezone: 'Asia/Bangkok',
    serverTimeUtc: '2026-10-14T03:00:00Z',
    fromUtc: '2026-10-13T17:00:00Z',
    toUtc: '2026-10-20T17:00:00Z',
    minNoticeHours: 24,
    maxAdvanceDays: 30,
    slots,
    ...extra,
  };
}

describe('TutorBookingPanel', () => {
  let fixture: ComponentFixture<TutorBookingPanel>;
  let httpMock: HttpTestingController;

  /** "Now" is pinned to Wed 14 Oct 2026 10:00 in Bangkok, so the first window is 14-20 Oct. Only Date and setInterval
   *  are faked: microtasks and the router keep running for real. */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  async function create(options: { tutor?: TutorPublicProfile; routes?: Routes } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(options.routes ?? []),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TutorBookingPanel);
    fixture.componentRef.setInput('tutor', options.tutor ?? profile());
    await settle();
    await settle();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const slotsReq = (): TestRequest => httpMock.expectOne((req) => req.url === '/api/tutoring/tutors/nina-tutor/slots');
  const buttonByText = (text: string): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const slotButtons = (): HTMLButtonElement[] => Array.from(root().querySelectorAll<HTMLButtonElement>('[role="tabpanel"] button[aria-pressed]'));
  const control = <T extends HTMLElement>(label: string): T => {
    const l = Array.from(root().querySelectorAll('label')).find((x) => x.textContent?.trim().startsWith(label))!;
    return root().querySelector<T>(`#${l.getAttribute('for')}`)!;
  };

  async function choose(select: HTMLSelectElement, value: string): Promise<void> {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  describe('slots request', () => {
    it('asks for the first seven Bangkok days of the first offering at 60 minutes, one-on-one', async () => {
      await create();
      const req = slotsReq();
      expect(req.request.params.get('offeringId')).toBe('off-physics');
      expect(req.request.params.get('from')).toBe('2026-10-13T17:00:00Z');
      expect(req.request.params.get('to')).toBe('2026-10-20T17:00:00Z');
      expect(req.request.params.get('durationMinutes')).toBe('60');
      expect(req.request.params.get('format')).toBe('OneOnOne');
      expect(req.request.params.has('trial')).toBe(false);
      req.flush(slotsBody([]));
      await settle();
    });

    it('lists the offerings as "subject - level - curriculum" in the active language', async () => {
      await create();
      const options = Array.from(control<HTMLSelectElement>('Subject and level').options).map((o) => o.textContent?.trim());
      expect(options).toEqual(['Physics - Upper secondary - Thai curriculum', 'Mathematics - Primary school - English Program (EP)']);
      slotsReq().flush(slotsBody([]));
      await settle();
    });

    it('shows the picker busy until the first response, then the slots', async () => {
      await create();
      expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
      slotsReq().flush(slotsBody([WED_0900, WED_1000]));
      await settle();
      expect(slotButtons().map((b) => b.textContent?.trim())).toEqual(['09:00', '10:00']);
    });
  });

  describe('price and summary', () => {
    it('shows the server quote verbatim - it is never recomputed from the hourly rate', async () => {
      await create();
      // 450/h x 90 min would be 675; the server says 700 (e.g. a package rule) and that is what must be shown.
      slotsReq().flush(slotsBody([WED_0900], quote(700, 60)));
      await settle();
      expect(root().querySelector('dl')?.textContent).toContain('฿700.00');
      expect(root().querySelector('dl')?.textContent).not.toContain('฿450.00');
    });

    it('shows the chosen time in Bangkok time once a slot is picked', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();
      expect(root().querySelector('dl')?.textContent).toContain('None yet');

      slotButtons()[0].click();
      await settle();
      expect(root().querySelector('dl')?.textContent).toContain('Wed 14 Oct, 09:00-10:00');
    });
  });

  describe('booking action', () => {
    it('stays disabled with an explanation while the booking route does not exist (never links into the catch-all)', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();
      slotButtons()[0].click();
      await settle();

      const cta = buttonByText('Online booking opens soon');
      expect(cta).toBeTruthy();
      expect(cta?.disabled).toBe(true);
      expect(root().textContent).toContain('Booking and payment are about to open');
      expect(root().querySelector('a[href*="/book"]')).toBeNull();
    });

    it('asks for a time first when the booking route exists but nothing is selected', async () => {
      await create({ routes: [{ path: 'tutors/:slug/book', component: BookingStub }] });
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();

      expect(buttonByText('Select a time to book')?.disabled).toBe(true);
      expect(root().textContent).not.toContain('about to open');
    });

    it('links to the booking page with the chosen offering, slot, length and format as a pre-selection', async () => {
      await create({ routes: [{ path: 'tutors/:slug/book', component: BookingStub }] });
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();
      slotButtons()[0].click();
      await settle();

      const link = root().querySelector<HTMLAnchorElement>('a[href^="/tutors/nina-tutor/book"]');
      expect(link).not.toBeNull();
      const query = new URL(link!.getAttribute('href')!, 'http://x').searchParams;
      expect(Object.fromEntries(query.entries())).toEqual({
        offeringId: 'off-physics',
        startsAtUtc: '2026-10-14T02:00:00Z',
        durationMinutes: '60',
        format: 'OneOnOne',
      });
      expect(link?.textContent?.trim()).toBe('Continue to booking');
    });
  });

  describe('lesson lengths', () => {
    const lengths = (): string[] => Array.from(control<HTMLSelectElement>('Lesson length').options).map((o) => o.value);

    it('offers exactly the lengths the tutor profile says the deployment allows, not a hard-coded list', async () => {
      await create({ tutor: profile({ allowedDurationMinutes: [45, 90, 150] }) });
      expect(lengths()).toEqual(['45', '90', '150']);
      slotsReq().flush(slotsBody([]));
      await settle();
    });

    it('starts on the shortest allowed length when 60 is not allowed, and asks the server for that length', async () => {
      await create({ tutor: profile({ allowedDurationMinutes: [45, 90] }) });
      const req = slotsReq();
      expect(req.request.params.get('durationMinutes')).toBe('45');
      expect(control<HTMLSelectElement>('Lesson length').value).toBe('45');
      req.flush(slotsBody([], quote(337.5, 45)));
      await settle();
    });

    it('falls back to the historical 30 / 60 / 90 / 120 only when the profile carries no list', async () => {
      await create({ tutor: { ...profile(), allowedDurationMinutes: undefined } as unknown as TutorPublicProfile });
      expect(lengths()).toEqual(['30', '60', '90', '120']);
      slotsReq().flush(slotsBody([]));
      await settle();
    });
  });

  describe('changing the lesson', () => {
    it('re-queries with the new length and drops the previous selection', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();
      slotButtons()[0].click();
      await settle();

      await choose(control<HTMLSelectElement>('Lesson length'), '90');
      const req = slotsReq();
      expect(req.request.params.get('durationMinutes')).toBe('90');
      req.flush(slotsBody([WED_0900], quote(675, 90)));
      await settle();

      expect(slotButtons()[0].getAttribute('aria-pressed')).toBe('false');
      expect(root().querySelector('dl')?.textContent).toContain('None yet');
    });

    it('offers the group format only when the offering has a group rate, and asks the server for group slots', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();

      const group = buttonByText('Small group')!;
      expect(buttonByText('One-on-one')?.getAttribute('aria-pressed')).toBe('true');
      group.click();
      await settle();

      const req = slotsReq();
      expect(req.request.params.get('format')).toBe('Group');
      req.flush(slotsBody([], quote(250), { format: 'Group' }));
      await settle();
      expect(group.getAttribute('aria-pressed')).toBe('true');
      expect(root().textContent).toContain('Groups of up to 4 students');
      expect(root().querySelector('dl')?.textContent).toContain('per seat');
    });

    it('hides the group choice for an offering without a group rate', async () => {
      await create();
      slotsReq().flush(slotsBody([]));
      await settle();

      await choose(control<HTMLSelectElement>('Subject and level'), 'off-math');
      const req = slotsReq();
      expect(req.request.params.get('offeringId')).toBe('off-math');
      req.flush(slotsBody([]));
      await settle();
      expect(buttonByText('Small group')).toBeUndefined();
    });

    it('offers a trial lesson, fixes the length to the trial length and says it is free', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();

      const trial = control<HTMLInputElement>('Trial lesson');
      trial.checked = true;
      trial.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();

      const req = slotsReq();
      expect(req.request.params.get('trial')).toBe('true');
      expect(req.request.params.get('durationMinutes')).toBe('30');
      req.flush(slotsBody([WED_0900], quote(0, 30, { isFree: true }), { isTrial: true }));
      await settle();
      expect(root().textContent).not.toContain('Lesson length');
      expect(root().querySelector('dl')?.textContent).toContain('Free');
    });

    it('drops the trial and group state when another offering is chosen', async () => {
      await create();
      slotsReq().flush(slotsBody([]));
      await settle();
      buttonByText('Small group')!.click();
      await settle();
      slotsReq().flush(slotsBody([], quote(250), { format: 'Group' }));
      await settle();

      await choose(control<HTMLSelectElement>('Subject and level'), 'off-math');
      const req = slotsReq();
      expect(req.request.params.get('format')).toBe('OneOnOne');
      expect(req.request.params.has('trial')).toBe(false);
      req.flush(slotsBody([]));
      await settle();
    });
  });

  describe('week paging', () => {
    it('moves the window by whole weeks and can go back', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();

      root().querySelector<HTMLButtonElement>('button[aria-label="Next week"]')!.click();
      await settle();
      const next = slotsReq();
      expect(next.request.params.get('from')).toBe('2026-10-20T17:00:00Z');
      expect(next.request.params.get('to')).toBe('2026-10-27T17:00:00Z');
      next.flush(slotsBody([]));
      await settle();

      root().querySelector<HTMLButtonElement>('button[aria-label="Previous week"]')!.click();
      await settle();
      const back = slotsReq();
      expect(back.request.params.get('from')).toBe('2026-10-13T17:00:00Z');
      back.flush(slotsBody([]));
      await settle();
    });

    it('cannot start a window beyond the tutor advance-booking horizon', async () => {
      await create({ tutor: profile({ maxAdvanceDays: 7 }) });
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();
      // Week 2 would start 7 days from today, which is exactly the horizon: allowed once, then the button turns off.
      const next = root().querySelector<HTMLButtonElement>('button[aria-label="Next week"]')!;
      expect(next.disabled).toBe(false);
      next.click();
      await settle();
      slotsReq().flush(slotsBody([]));
      await settle();
      expect(root().querySelector<HTMLButtonElement>('button[aria-label="Next week"]')!.disabled).toBe(true);
    });

    it('disables "previous" on the first window', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();
      expect(root().querySelector<HTMLButtonElement>('button[aria-label="Previous week"]')!.disabled).toBe(true);
    });
  });

  describe('failures and refresh', () => {
    it('explains a rejected lesson length from the server and retries on demand', async () => {
      await create();
      slotsReq().flush({ title: 'x', errorCode: 'validation', reason: 'tutoring.duration_not_allowed' }, { status: 400, statusText: 'Bad Request' });
      await settle();

      expect(root().textContent).toContain('This lesson length is not supported');
      buttonByText('Try again')!.click();
      await settle();
      slotsReq().flush(slotsBody([WED_0900]));
      await settle();
      expect(slotButtons()).toHaveLength(1);
    });

    it('refreshes the calendar every minute without flashing a loading state, and drops a slot that was taken', async () => {
      await create();
      slotsReq().flush(slotsBody([WED_0900, WED_1000]));
      await settle();
      slotButtons()[0].click();
      await settle();

      vi.advanceTimersByTime(60_000);
      await settle();
      expect(root().querySelector('[aria-busy="true"]')).toBeNull();
      slotsReq().flush(slotsBody([WED_1000]));
      await settle();

      expect(slotButtons().map((b) => b.textContent?.trim())).toEqual(['10:00']);
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('just taken');
      expect(root().querySelector('dl')?.textContent).toContain('None yet');
    });
  });
});
