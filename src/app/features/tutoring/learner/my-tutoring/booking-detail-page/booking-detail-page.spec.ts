import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { Booking } from '../../../data/tutoring-learner.models';
import { confirmedBooking } from '../../testing/learner-fixtures';
import { SESSION_ID, material, quote, refund, reviewState, summary } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { BookingDetailPage } from './booking-detail-page';

@Component({ template: '' })
class RouteStub {}

const BOOKING = '/api/tutoring/bookings/b-1';
const SESSION_URL = `/api/tutoring/sessions/${SESSION_ID}/materials`;

function booking(overrides: Partial<Booking> = {}): Booking {
  return confirmedBooking({ sessionId: SESSION_ID, attendance: null, disputeId: null, disputeWindowEndsAtUtc: null, ...overrides });
}

describe('BookingDetailPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'my-tutoring/bookings/:bookingId', component: BookingDetailPage },
          { path: 'my-tutoring', component: RouteStub },
          { path: 'tutoring/checkout/:bookingId', component: RouteStub },
        ]),
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const hrefs = (): string[] => Array.from(root().querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');

  /** Opens the page and answers the booking; the sections' own requests are answered by the caller through `httpMock`. */
  async function open(body: Booking | 'error' | 'notFound' | 'pending'): Promise<void> {
    await harness.navigateByUrl('/my-tutoring/bookings/b-1', BookingDetailPage);
    await settle(harness);
    if (body === 'pending') {
      return;
    }
    const request = httpMock.expectOne(BOOKING);
    if (body === 'error') {
      request.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    } else if (body === 'notFound') {
      request.flush({ title: 'Not found', status: 404, errorCode: 'not_found', reason: 'tutoring.booking_not_found' }, { status: 404, statusText: 'Not Found' });
    } else {
      request.flush(body);
    }
    await settle(harness);
  }

  async function answer(url: string, body: object, init: { status: number; statusText: string } = { status: 200, statusText: 'OK' }): Promise<void> {
    httpMock.expectOne(url).flush(body, init);
    await settle(harness);
  }

  it('shows a busy skeleton while the booking loads', async () => {
    await open('pending');

    expect(root().querySelector('[role="status"][aria-label="Loading the lesson"]')).not.toBeNull();
    httpMock.expectOne(BOOKING).flush(booking());
  });

  it('reads another account\'s booking and a missing one the same way: not found', async () => {
    await open('notFound');

    expect(textOf(root())).toContain('We could not find this lesson');
    expect(buttonByText(root(), 'Try again')).toBeNull();
    expect(hrefs()).toContain('/my-tutoring');
  });

  it('shows an error with a retry for a failure that is not a 404', async () => {
    await open('error');

    expect(textOf(root())).toContain('We could not load this lesson');
    buttonByText(root(), 'Try again')?.click();
    await settle(harness);
    await answer(BOOKING, booking());
    await answer(SESSION_URL, []);

    expect(textOf(root())).toContain('Physics');
  });

  it('says a lesson was booked with a package credit and links to that package; an ordinary lesson has no such line', async () => {
    await open(booking({ packagePurchaseId: 'pp-1' }));
    await answer(SESSION_URL, []);

    expect(textOf(root())).toContain('Booked with a package credit.');
    expect(hrefs()).toContain('/my-tutoring/packages/pp-1');
  });

  it('shows no package line for a lesson that was paid for on its own', async () => {
    await open(booking({ packagePurchaseId: null }));
    await answer(SESSION_URL, []);

    expect(textOf(root())).not.toContain('package credit');
    expect(hrefs().some((href) => href.startsWith('/my-tutoring/packages'))).toBe(false);
  });

  it('shows the lesson in full: subject, tutor, when, learner, format, price, number and status', async () => {
    await open(booking());
    await answer(SESSION_URL, []);

    const text = textOf(root());
    expect(text).toContain('Physics');
    expect(text).toContain('with Nina Tutor');
    expect(text).toContain('Tue 20 Oct');
    expect(text).toContain('Mint · Secondary 4');
    expect(text).toContain('One-on-one');
    expect(text).toContain('฿450.00');
    expect(text).toContain('TB-261014-A1B2C3');
    expect(text).toContain('Confirmed');
  });

  it('shows the refund the server has decided on, as the server sent it, and hides the line when there is none', async () => {
    await open(booking({ status: 'CancelledByLearner', canJoin: false, joinOpensAtUtc: null, refundedAmount: 225 }));
    await answer(`${BOOKING}/refunds`, [refund({ amount: 225 })]);

    expect(textOf(root())).toMatch(/Refunded or being refunded\s*฿225\.00/);
  });

  it('shows a free trial as free', async () => {
    await open(booking({ isTrial: true, priceAmount: 0 }));
    await answer(SESSION_URL, []);

    expect(textOf(root())).toContain('Free');
    expect(textOf(root())).not.toContain('฿');
  });

  describe('a confirmed lesson', () => {
    it('leads to the join page when the server says the window is open, and offers cancelling', async () => {
      await open(booking({ canJoin: true }));
      await answer(SESSION_URL, []);

      expect(hrefs()).toContain(`/tutoring/sessions/${SESSION_ID}/join`);
      expect(buttonByText(root(), 'Cancel lesson')).not.toBeNull();
    });

    it('shows the materials of the class and asks for nothing about a review, a summary or a refund', async () => {
      await open(booking());
      await answer(SESSION_URL, [material()]);

      expect(textOf(root())).toContain('Practice sheet');
      httpMock.expectNone(`${BOOKING}/summary`);
      httpMock.expectNone(`${BOOKING}/review`);
      httpMock.expectNone(`${BOOKING}/refunds`);
    });

    it('asks for the materials of the booking\'s own session, by the `sessionId` the booking carries', async () => {
      await open(booking({ sessionId: 'session-77', canJoin: true }));
      await answer('/api/tutoring/sessions/session-77/materials', [material()]);

      expect(textOf(root())).toContain('Practice sheet');
      expect(hrefs()).toContain('/tutoring/sessions/session-77/join');
    });

    it('opens the cancel dialog, which asks the server what cancelling would do', async () => {
      await open(booking());
      await answer(SESSION_URL, []);

      buttonByText(root(), 'Cancel lesson')?.click();
      await settle(harness);
      httpMock.expectOne(`${BOOKING}/cancellation-quote`).flush(quote());
      httpMock.expectOne('/api/tutoring/cancellation-policy').flush({ fullRefundHours: 24, fullRefundPercent: 100, lateRefundPercent: 50, tutorCancelRefundPercent: 100, tutorNoShowRefundPercent: 100, learnerNoShowRefundPercent: 0, disputeWindowHours: 24 });
      await settle(harness);

      expect(root().querySelector('[role="dialog"]')).not.toBeNull();
      expect(textOf(root())).toMatch(/Refund to you\s*฿450\.00/);
    });

    it('reads the booking again once it is cancelled, and shows the new status', async () => {
      await open(booking());
      await answer(SESSION_URL, []);
      buttonByText(root(), 'Cancel lesson')?.click();
      await settle(harness);
      httpMock.expectOne(`${BOOKING}/cancellation-quote`).flush(quote());
      httpMock.expectOne('/api/tutoring/cancellation-policy').flush({ fullRefundHours: 24, fullRefundPercent: 100, lateRefundPercent: 50, tutorCancelRefundPercent: 100, tutorNoShowRefundPercent: 100, learnerNoShowRefundPercent: 0, disputeWindowHours: 24 });
      await settle(harness);

      buttonByText(root(), 'Cancel the lesson')?.click();
      await settle(harness);
      httpMock.expectOne(`${BOOKING}/cancel`).flush({ bookingId: 'b-1', status: 'CancelledByLearner', alreadyCancelled: false, refundAmount: 450, retainedAmount: 0, settlement: 'Money', refund: null, creditRestored: false });
      await settle(harness);
      httpMock.expectOne(BOOKING).flush(booking({ status: 'CancelledByLearner', canJoin: false, refundedAmount: 450 }));
      await settle(harness);
      httpMock.expectOne(`${BOOKING}/refunds`).flush([refund({ status: 'Requested' })]);
      await settle(harness);

      expect(textOf(root())).toContain('Cancelled by you');
      expect(textOf(root())).toContain('Refund in progress');
    });

    it('offers "the class went well" only when the server\'s hint allows it', async () => {
      await open(booking({ attendance: { learnerJoinedAtUtc: '2026-10-20T11:00:00Z', tutorPresentAttested: false, confirmedCompletedAtUtc: null, canConfirmCompleted: true } }));
      await answer(SESSION_URL, []);

      expect(buttonByText(root(), 'The class went well')).not.toBeNull();
    });

    it('does not offer it when the server\'s hint says no', async () => {
      await open(booking({ attendance: { learnerJoinedAtUtc: null, tutorPresentAttested: false, confirmedCompletedAtUtc: null, canConfirmCompleted: false } }));
      await answer(SESSION_URL, []);

      expect(buttonByText(root(), 'The class went well')).toBeNull();
    });
  });

  describe('a booking waiting for payment', () => {
    it('leads to the payment and offers to cancel the booking, with nothing else to load', async () => {
      await open(booking({ status: 'PendingPayment', requiresPayment: true, canJoin: false, joinOpensAtUtc: null }));

      expect(hrefs()).toContain('/tutoring/checkout/b-1');
      expect(buttonByText(root(), 'Cancel booking')).not.toBeNull();
      expect(root().querySelector('app-booking-materials-section')).toBeNull();
    });
  });

  describe('a finished lesson', () => {
    it('shows the tutor\'s summary, the materials and the review, each loading on its own', async () => {
      await open(booking({ status: 'Completed', canJoin: false, joinOpensAtUtc: null }));
      await answer(`${BOOKING}/summary`, summary());
      await answer(SESSION_URL, [material()]);
      await answer(`${BOOKING}/review`, reviewState());

      const text = textOf(root());
      expect(text).toContain('From your tutor');
      expect(text).toContain('Newton laws');
      expect(text).toContain('Class materials');
      expect(text).toContain('Practice sheet');
      expect(text).toContain('Your review');
      expect(root().querySelectorAll('input[type="radio"]')).toHaveLength(5);
    });

    it('keeps the rest of the page when one section fails', async () => {
      await open(booking({ status: 'Completed', canJoin: false, joinOpensAtUtc: null }));
      await answer(`${BOOKING}/summary`, { title: 'x' }, { status: 500, statusText: 'Server Error' });
      await answer(SESSION_URL, [material()]);
      await answer(`${BOOKING}/review`, reviewState({ canReview: false, reasonCode: 'window_closed' }));

      const text = textOf(root());
      expect(text).toContain('We could not load the lesson summary.');
      expect(text).toContain('Practice sheet');
      expect(text).toContain('The time to review this lesson has passed.');
    });

    it('offers to report a problem inside the window the server gave, and links the existing report instead once there is one', async () => {
      await open(booking({ status: 'Completed', disputeWindowEndsAtUtc: '2026-10-21T12:00:00Z', canJoin: false, joinOpensAtUtc: null }));
      await answer(`${BOOKING}/summary`, summary());
      await answer(SESSION_URL, []);
      await answer(`${BOOKING}/review`, reviewState());

      expect(buttonByText(root(), 'Report a problem')).not.toBeNull();
      expect(textOf(root())).toContain('you can report a problem until 21 Oct 2026 19:00');
    });

    it('links the existing report', async () => {
      await open(booking({ status: 'Disputed', disputeId: 'd-3', canJoin: false, joinOpensAtUtc: null }));
      await answer(`${BOOKING}/refunds`, []);
      await answer(`${BOOKING}/summary`, summary());
      await answer(SESSION_URL, []);

      expect(hrefs()).toContain('/my-tutoring/disputes/d-3');
      expect(buttonByText(root(), 'Report a problem')).toBeNull();
    });
  });

  describe('a cancelled lesson', () => {
    it('shows the refunds in words and nothing that only makes sense after a lesson (summary, materials, review)', async () => {
      await open(booking({ status: 'CancelledByTutor', canJoin: false, joinOpensAtUtc: null, refundedAmount: 450 }));
      await answer(`${BOOKING}/refunds`, [refund({ status: 'Completed', completedAtUtc: '2026-10-18T04:00:00Z', isAsync: false })]);

      const text = textOf(root());
      expect(text).toContain('Refunds');
      expect(text).toContain('Refunded on 18 Oct 2026');
      expect(root().querySelector('app-booking-summary-section')).toBeNull();
      expect(root().querySelector('app-booking-materials-section')).toBeNull();
      expect(root().querySelector('app-review-section')).toBeNull();
    });

    it('does not ask for refunds of a free trial', async () => {
      await open(booking({ status: 'CancelledByLearner', isTrial: true, priceAmount: 0, canJoin: false, joinOpensAtUtc: null }));

      httpMock.expectNone(`${BOOKING}/refunds`);
      expect(root().querySelector('app-refund-status')).toBeNull();
    });
  });
});
