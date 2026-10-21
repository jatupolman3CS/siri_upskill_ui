import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { BookingListItem } from '../../../data/tutoring-learner.models';
import { SESSION_ID, listItem } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, settle, textOf } from '../../testing/spec-helpers';
import { BookingCard } from './booking-card';

describe('BookingCard', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [BookingCard], providers: [provideRouter([]), ...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function render(item: BookingListItem, offsetMs = 0): Promise<{ fixture: ComponentFixture<BookingCard>; root: HTMLElement }> {
    const fixture = TestBed.createComponent(BookingCard);
    fixture.componentRef.setInput('booking', item);
    fixture.componentRef.setInput('offsetMs', offsetMs);
    await settle(fixture);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const hrefs = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');

  it('shows the subject, the tutor, the learner, the length and the price the server sent', async () => {
    const { root } = await render(listItem());

    const text = textOf(root);
    expect(text).toContain('Physics');
    expect(text).toContain('with Nina Tutor');
    expect(text).toContain('For Mint');
    expect(text).toContain('Secondary 4');
    expect(text).toContain('60 min');
    expect(text).toContain('฿450.00');
    expect(text).toContain('Confirmed');
  });

  it('marks a lesson that was booked with a package credit, and only that one', async () => {
    const credit = await render(listItem({ packagePurchaseId: 'pp-1' }));
    expect(textOf(credit.root)).toContain('Package credit');

    const ordinary = await render(listItem({ packagePurchaseId: null }));
    expect(textOf(ordinary.root)).not.toContain('Package credit');
  });

  it('labels a free trial as free and as a trial', async () => {
    const { root } = await render(listItem({ isTrial: true, priceAmount: 0 }));

    expect(textOf(root)).toContain('Trial lesson');
    expect(textOf(root)).toContain('Free');
    expect(textOf(root)).not.toContain('฿');
  });

  it('marks a group lesson', async () => {
    const { root } = await render(listItem({ format: 'Group' }));

    expect(textOf(root)).toContain('Small group');
  });

  it('leads to the join page when the server says the window is open', async () => {
    const { root } = await render(listItem({ canJoin: true }));

    expect(hrefs(root)).toContain(`/tutoring/sessions/${SESSION_ID}/join`);
    expect(textOf(root)).toContain('Join class');
  });

  it('counts down to a join window that is not open yet, with no join link', async () => {
    // The device clock is off by exactly what the page was told: 2026-10-20T10:00Z on the server is 45 minutes before the window.
    const offset = Date.parse('2026-10-20T10:00:00Z') - Date.now();
    const { root } = await render(listItem({ canJoin: false, joinOpensAtUtc: '2026-10-20T10:45:00Z' }), offset);

    expect(root.querySelector('app-live-countdown')).not.toBeNull();
    expect(textOf(root)).toContain('You can join in');
    expect(hrefs(root).some((href) => href.endsWith('/join'))).toBe(false);
  });

  it('asks the list to read again at the moment the join window opens', async () => {
    vi.useFakeTimers();
    try {
      // On the server clock the window opens 1.5 seconds from now.
      const opensAt = new Date(Date.now() + 1_500).toISOString();
      const fixture = TestBed.createComponent(BookingCard);
      const reached = vi.fn();
      fixture.componentInstance.joinWindowReached.subscribe(reached);
      fixture.componentRef.setInput('booking', listItem({ canJoin: false, joinOpensAtUtc: opensAt }));
      await settle(fixture);
      expect(reached).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2_000);

      expect(reached).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('links Join to the join page of the booking\'s own session (not of the booking id)', async () => {
    const { root } = await render(listItem({ sessionId: 'session-77', canJoin: true }));

    expect(hrefs(root)).toContain('/tutoring/sessions/session-77/join');
    expect(hrefs(root).some((href) => href.includes('/b-1/join'))).toBe(false);
    expect(textOf(root)).not.toContain('confirmation e-mail');
  });

  it('offers payment for a booking that is waiting for it, and nothing to join', async () => {
    const { root } = await render(listItem({ status: 'PendingPayment', requiresPayment: true, canJoin: false, joinOpensAtUtc: null }));

    expect(hrefs(root)).toContain('/tutoring/checkout/b-1');
    expect(textOf(root)).toContain('Pay now');
    expect(textOf(root)).toContain('Waiting for payment');
    expect(hrefs(root).some((href) => href.endsWith('/join'))).toBe(false);
  });

  it('links to the lesson in full', async () => {
    const { root } = await render(listItem());

    expect(hrefs(root)).toContain('/my-tutoring/bookings/b-1');
  });

  it('shows the refund the list item carries - the server\'s `refundedAmount` - and never calls the refunds endpoint per card', async () => {
    const { root } = await render(listItem({ status: 'CancelledByLearner', canJoin: false, joinOpensAtUtc: null, refundedAmount: 225 }));

    expect(textOf(root)).toContain('Cancelled by you');
    expect(textOf(root)).toMatch(/Refunded or being refunded\s*฿225\.00/);
    expect(root.querySelector('app-refund-status')).toBeNull();
    httpMock.expectNone('/api/tutoring/bookings/b-1/refunds');
  });

  it('prints no refund line, and asks nothing, for a booking with no refund', async () => {
    const { root } = await render(listItem({ refundedAmount: 0 }));
    await render(listItem({ status: 'CancelledByLearner', isTrial: true, priceAmount: 0, refundedAmount: 0 }));

    expect(textOf(root)).not.toContain('Refunded');
    httpMock.expectNone('/api/tutoring/bookings/b-1/refunds');
  });

  it('never prints a hand-computed amount: the price is exactly the booking price', async () => {
    const { root } = await render(listItem({ priceAmount: 333.33 }));

    expect(textOf(root)).toContain('฿333.33');
  });
});
