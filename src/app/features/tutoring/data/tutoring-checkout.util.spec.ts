import type { BookingStatus } from './tutoring-learner.models';
import { booking } from '../learner/testing/learner-fixtures';
import { packagePurchase } from '../testing/package-fixtures';
import { bookingStageOf, checkoutSubjectOfBooking, checkoutSubjectOfPurchase, isPaymentSettled, paymentOutcomeOf } from './tutoring-checkout.util';
import type { LatePaymentResolution, TutoringPaymentState } from './tutoring-payment.models';

const state = (status: TutoringPaymentState['status'], lateResolution: LatePaymentResolution | null = 'None'): TutoringPaymentState => ({
  paymentId: 'pay-1',
  kind: 'Booking',
  referenceId: 'b-1',
  status,
  method: 'Card',
  amount: 450,
  refundedCompletedAmount: 0,
  refundPendingAmount: 0,
  lateResolution,
  bookingStatus: null,
  updatedAtUtc: '2026-10-14T03:00:00Z',
});

describe('paymentOutcomeOf', () => {
  it.each([
    ['Pending', 'None', 'pending'],
    ['Failed', 'None', 'failed'],
    ['Expired', 'None', 'expired'],
    ['Succeeded', 'None', 'paid'],
    ['Succeeded', 'Reopened', 'paid'],
    ['Succeeded', 'Refunded', 'refunded'],
    ['Succeeded', 'Duplicate', 'refunded'],
    ['Succeeded', 'Orphan', 'refunded'],
    ['PartiallyRefunded', 'None', 'paid'],
    ['Refunded', 'Refunded', 'refunded'],
  ] as const)('reads %s with late resolution %s as %s', (status, late, outcome) => {
    expect(paymentOutcomeOf(state(status, late))).toBe(outcome);
  });

  it('treats a null late resolution as None, as the contract says', () => {
    expect(paymentOutcomeOf(state('Succeeded', null))).toBe('paid');
  });
});

describe('isPaymentSettled', () => {
  it('is false only while the payment is pending', () => {
    expect(isPaymentSettled(state('Pending'))).toBe(false);
    for (const status of ['Failed', 'Expired', 'Succeeded', 'PartiallyRefunded', 'Refunded'] as const) {
      expect(isPaymentSettled(state(status))).toBe(true);
    }
  });
});

describe('bookingStageOf', () => {
  it.each([
    ['PendingPayment', 'payable'],
    ['Confirmed', 'confirmed'],
    ['Expired', 'ended'],
    ['CancelledByLearner', 'ended'],
    ['CancelledByTutor', 'ended'],
    ['Completed', 'finalized'],
    ['NoShowLearner', 'finalized'],
    ['NoShowTutor', 'finalized'],
    ['NoShowBoth', 'finalized'],
    ['Disputed', 'finalized'],
  ] as readonly (readonly [BookingStatus, string])[])('puts %s in the %s stage', (status, stage) => {
    expect(bookingStageOf(status)).toBe(stage);
  });
});

describe('checkoutSubjectOfBooking', () => {
  it('reduces a held booking to the price, stage, deadline, clock and payment the server gave', () => {
    expect(checkoutSubjectOfBooking(booking({ paymentId: 'pay-1' }))).toEqual({
      id: 'b-1',
      amount: 450,
      stage: 'payable',
      holdExpiresAtUtc: '2026-10-14T03:15:00Z',
      serverTimeUtc: '2026-10-14T03:00:00Z',
      paymentId: 'pay-1',
    });
  });
});

describe('checkoutSubjectOfPurchase', () => {
  it('reduces a purchase waiting for payment to its snapshot price, payment window and server clock', () => {
    expect(checkoutSubjectOfPurchase(packagePurchase())).toEqual({
      id: 'pp-1',
      amount: 4050,
      stage: 'payable',
      holdExpiresAtUtc: '2026-10-14T03:30:00Z',
      serverTimeUtc: '2026-10-14T03:00:00Z',
      paymentId: null,
    });
  });

  it('moves to the stage that matches the purchase status', () => {
    expect(checkoutSubjectOfPurchase(packagePurchase({ status: 'Active', pendingExpiresAtUtc: null })).stage).toBe('confirmed');
    expect(checkoutSubjectOfPurchase(packagePurchase({ status: 'Cancelled' })).stage).toBe('ended');
  });
});
