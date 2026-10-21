import { Component, signal } from '@angular/core';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { Booking } from '../../../data/tutoring-learner.models';
import type { PackagePurchaseDetail } from '../../../data/tutoring-package-purchase.models';
import { packageDetail } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { confirmedBooking, slotsResponse } from '../../testing/learner-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { PackageCreditBooking } from './package-credit-booking';

@Component({
  imports: [PackageCreditBooking],
  template: `<app-package-credit-booking [purchase]="purchase()" offeringId="off-physics" (booked)="booked.push($event)" (purchaseChanged)="changed = changed + 1" />`,
})
class Host {
  readonly purchase = signal<PackagePurchaseDetail>(packageDetail());
  readonly booked: Booking[] = [];
  changed = 0;
}

const BOOK_URL = '/api/tutoring/package-purchases/pp-1/bookings';
/** 2026-10-20T11:00Z is 18:00 on Tuesday 20 Oct in Bangkok. */
const SLOT_START = '2026-10-20T11:00:00Z';

describe('PackageCreditBooking', () => {
  let fixture: ComponentFixture<Host>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([]), ...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await settle(fixture);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const slotRequests = (): TestRequest[] => httpMock.match((request) => request.url.endsWith('/slots'));
  const slotButton = (): HTMLButtonElement | null => root().querySelector('[role="tabpanel"] ul button');
  const bookButton = (): HTMLButtonElement | null => buttonByText(root(), 'Book with 1 credit');

  async function openCalendar(slots: readonly string[] = [SLOT_START]): Promise<void> {
    const [request, ...extra] = slotRequests();
    expect(extra).toHaveLength(0);
    request.flush(slotsResponse(slots));
    await settle(fixture);
    await settle(fixture);
  }

  it('asks for the calendar of the purchase\'s own subject, length and one-on-one format - never anything the person chose', async () => {
    const [request] = slotRequests();

    expect(request.request.url).toBe('/api/tutoring/tutors/nina-tutor/slots');
    expect(request.request.params.get('offeringId')).toBe('off-physics');
    expect(request.request.params.get('durationMinutes')).toBe('60');
    expect(request.request.params.get('format')).toBe('OneOnOne');
    expect(request.request.params.has('trial')).toBe(false);
    // The window is seven Bangkok days from today.
    expect(request.request.params.get('from')).toBe('2026-10-13T17:00:00Z');
    expect(request.request.params.get('to')).toBe('2026-10-20T17:00:00Z');
    request.flush(slotsResponse([]));
  });

  it('says the lesson length, that it must start before the expiry date, and that it uses one credit', async () => {
    await openCalendar();

    const text = textOf(root());
    expect(text).toContain('Choose a time for a 60-minute lesson');
    expect(text).toContain('The lesson must start before 12 Jan 2027 10:05.');
    expect(text).toContain('Booking uses one lesson of this package.');
  });

  it('needs a time before it lets the person book', async () => {
    await openCalendar();

    expect(bookButton()?.disabled).toBe(true);
    expect(textOf(root())).toContain('Pick a time first.');
    slotButton()?.click();
    await settle(fixture);

    expect(bookButton()?.disabled).toBe(false);
  });

  it('books with only the chosen start, tells the person, links to the lesson and lets the page read the purchase again', async () => {
    await openCalendar();
    slotButton()?.click();
    await settle(fixture);

    bookButton()?.click();
    await settle(fixture);
    const request = httpMock.expectOne(BOOK_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ startsAtUtc: SLOT_START });
    request.flush(confirmedBooking({ bookingId: 'b-9', packagePurchaseId: 'pp-1', startsAtUtc: SLOT_START }), { status: 201, statusText: 'Created' });
    await settle(fixture);
    // The calendar is read again so the time just booked disappears from it.
    slotRequests().forEach((reload) => reload.flush(slotsResponse([])));
    await settle(fixture);

    expect(fixture.componentInstance.booked.map((booking) => booking.bookingId)).toEqual(['b-9']);
    expect(textOf(root())).toContain('Your lesson is booked.');
    expect(textOf(root())).toContain('It takes place Tue 20 Oct 18:00');
    expect(root().querySelector('[role="status"] a')?.getAttribute('href')).toBe('/my-tutoring/bookings/b-9');
  });

  it('guards against a double click: one booking is made', async () => {
    await openCalendar();
    slotButton()?.click();
    await settle(fixture);

    bookButton()?.click();
    await settle(fixture);
    bookButton()?.click();
    await settle(fixture);

    expect(httpMock.match(BOOK_URL)).toHaveLength(1);
  });

  it.each([['tutoring.slot_taken'], ['tutoring.slot_unavailable'], ['tutoring.slot_too_soon']])(
    'when the server says the time is gone (%s) it explains, forgets the choice and reads the calendar again',
    async (reason) => {
      await openCalendar();
      slotButton()?.click();
      await settle(fixture);

      bookButton()?.click();
      await settle(fixture);
      httpMock.expectOne(BOOK_URL).flush({ title: 'x', errorCode: 'conflict', reason }, { status: 409, statusText: 'Conflict' });
      await settle(fixture);

      expect(root().querySelector('[role="alert"]')).not.toBeNull();
      expect(bookButton()?.disabled).toBe(true);
      expect(slotRequests()).toHaveLength(1);
      expect(fixture.componentInstance.booked).toHaveLength(0);
    },
  );

  it('names the expiry date when the chosen time is after it, and asks for an earlier one', async () => {
    await openCalendar();
    slotButton()?.click();
    await settle(fixture);

    bookButton()?.click();
    await settle(fixture);
    httpMock
      .expectOne(BOOK_URL)
      .flush({ title: 'x', errorCode: 'conflict', reason: 'tutoring.package_session_after_expiry', expiresAtUtc: '2026-10-22T03:00:00Z' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    const text = textOf(root());
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('That time is after your package expires.');
    expect(text).toContain('Your package expires on 22 Oct 2026 10:00.');
    expect(bookButton()?.disabled).toBe(true);
  });

  it.each([['tutoring.package_no_credit'], ['tutoring.package_expired'], ['tutoring.package_not_active']])(
    'when the server says the package itself changed (%s) it explains and tells the page to read the purchase again',
    async (reason) => {
      await openCalendar();
      slotButton()?.click();
      await settle(fixture);

      bookButton()?.click();
      await settle(fixture);
      httpMock.expectOne(BOOK_URL).flush({ title: 'x', errorCode: 'conflict', reason }, { status: 409, statusText: 'Conflict' });
      await settle(fixture);

      expect(fixture.componentInstance.changed).toBe(1);
      expect(root().querySelector('[role="alert"]')).not.toBeNull();
    },
  );

  it('explains any other refusal in the server\'s words and lets the person try again', async () => {
    await openCalendar();
    slotButton()?.click();
    await settle(fixture);

    bookButton()?.click();
    await settle(fixture);
    httpMock
      .expectOne(BOOK_URL)
      .flush({ title: 'x', errorCode: 'conflict', reason: 'tutoring.package_tutor_unavailable' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    expect(root().querySelector('[role="alert"]')?.textContent).toContain('cannot take new lessons right now');
    // The time is still the person's choice (nothing says it is gone), so they can simply try again.
    expect(bookButton()?.disabled).toBe(false);
    bookButton()?.click();
    await settle(fixture);
    httpMock.expectOne(BOOK_URL).flush({ title: 'x', errorCode: 'conflict', reason: 'tutoring.package_tutor_unavailable' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
  });

  it('shows an error with a retry when the calendar cannot be read', async () => {
    const [request] = slotRequests();
    request.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    await settle(fixture);

    expect(textOf(root())).toContain('Try again');
    expect(bookButton()?.disabled).toBe(true);
  });

  it('pages to the next week and asks for it', async () => {
    await openCalendar();

    (root().querySelector('button[aria-label="Next week"]') as HTMLButtonElement).click();
    await settle(fixture);
    const [request] = slotRequests();

    expect(request.request.params.get('from')).toBe('2026-10-20T17:00:00Z');
    request.flush(slotsResponse([]));
  });
});
