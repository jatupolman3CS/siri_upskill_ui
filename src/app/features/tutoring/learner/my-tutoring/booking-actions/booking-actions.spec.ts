import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { Booking } from '../../../data/tutoring-learner.models';
import { confirmedBooking } from '../../testing/learner-fixtures';
import { SESSION_ID } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { CancelBookingDialog } from '../cancel-booking-dialog/cancel-booking-dialog';
import { BookingActions } from './booking-actions';

describe('BookingActions', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [BookingActions], providers: [provideRouter([]), ...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  async function render(overrides: Partial<Booking>, offsetMs = 0): Promise<{ fixture: ComponentFixture<BookingActions>; root: HTMLElement; changed: ReturnType<typeof vi.fn> }> {
    const fixture = TestBed.createComponent(BookingActions);
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.componentRef.setInput('booking', confirmedBooking({ sessionId: SESSION_ID, ...overrides }));
    fixture.componentRef.setInput('offsetMs', offsetMs);
    await settle(fixture);
    return { fixture, root: fixture.nativeElement as HTMLElement, changed };
  }

  it('offers payment and cancelling a booking that is waiting for payment', async () => {
    const { root } = await render({ status: 'PendingPayment', requiresPayment: true, canJoin: false, joinOpensAtUtc: null });

    expect(root.querySelector('a')?.getAttribute('href')).toBe('/tutoring/checkout/b-1');
    expect(buttonByText(root, 'Cancel booking')).not.toBeNull();
  });

  it('tells the cancel dialog when the lesson was booked with a package credit, so it can say what happens to the credit', async () => {
    const credit = await render({ packagePurchaseId: 'pp-1' });
    const ordinary = await render({ packagePurchaseId: null });
    const dialogOf = (fixture: ComponentFixture<BookingActions>): { packageBooking(): boolean } =>
      fixture.debugElement.query(By.directive(CancelBookingDialog)).componentInstance as { packageBooking(): boolean };

    expect(dialogOf(credit.fixture).packageBooking()).toBe(true);
    expect(dialogOf(ordinary.fixture).packageBooking()).toBe(false);
  });

  it('offers nothing at all for a lesson that is over and has nothing left to do', async () => {
    const { root } = await render({ status: 'Completed', canJoin: false, joinOpensAtUtc: null, attendance: null });

    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it.each(['CancelledByLearner', 'CancelledByTutor', 'Expired', 'NoShowTutor'] as const)('does not offer cancelling a %s booking', async (status) => {
    const { root } = await render({ status, canJoin: false, joinOpensAtUtc: null });

    expect(buttonByText(root, 'Cancel lesson')).toBeNull();
    expect(buttonByText(root, 'Cancel booking')).toBeNull();
  });

  it('tells the page to read the booking again when the join window reaches zero', async () => {
    vi.useFakeTimers();
    const { fixture, changed } = await render({ canJoin: false, joinOpensAtUtc: new Date(Date.now() + 1_500).toISOString() });
    expect(changed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    await settle(fixture);

    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('tells the page to read the booking again once the learner confirms the class went well', async () => {
    const { fixture, root, changed } = await render({
      attendance: { learnerJoinedAtUtc: '2026-10-20T11:00:00Z', tutorPresentAttested: false, confirmedCompletedAtUtc: null, canConfirmCompleted: true },
    });

    buttonByText(root, 'The class went well')?.click();
    await settle(fixture);
    expect(textOf(root)).toContain('Confirm the class went well');
    buttonByText(root, 'Yes, confirm')?.click();
    await settle(fixture);
    httpMock.expectOne('/api/tutoring/bookings/b-1/confirm-completed').flush({ bookingId: 'b-1', status: 'Completed', confirmedAtUtc: 'x' });
    await settle(fixture);

    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('tells the page to read the booking again once the learner cancels', async () => {
    const { fixture, root, changed } = await render({});

    buttonByText(root, 'Cancel lesson')?.click();
    await settle(fixture);
    httpMock.expectOne('/api/tutoring/bookings/b-1/cancellation-quote').flush({
      bookingId: 'b-1',
      canCancel: true,
      refusalReason: null,
      ruleCode: 'learner_cancel.full',
      amountPaid: 450,
      refundAmount: 450,
      retainedAmount: 0,
      refundPercent: 100,
      settlement: 'Money',
      refundIsAsync: false,
      startsAtUtc: '2026-10-20T11:00:00Z',
      quotedAtUtc: '2026-10-14T03:00:00Z',
      hoursUntilStart: 152,
    });
    httpMock.expectOne('/api/tutoring/cancellation-policy').flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    buttonByText(root, 'Cancel the lesson')?.click();
    await settle(fixture);
    httpMock.expectOne('/api/tutoring/bookings/b-1/cancel').flush({
      bookingId: 'b-1',
      status: 'CancelledByLearner',
      alreadyCancelled: false,
      refundAmount: 450,
      retainedAmount: 0,
      settlement: 'Money',
      refund: null,
      creditRestored: false,
    });
    await settle(fixture);

    expect(changed).toHaveBeenCalledTimes(1);
  });
});
