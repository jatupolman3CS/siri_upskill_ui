import { Observable, Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../../core/http/error.interceptor';
import { type PaymentPollerConfig, startPaymentPolling } from './payment-status-poller';
import type { TutoringPaymentState } from './tutoring-payment.models';

const state = (status: TutoringPaymentState['status']): TutoringPaymentState => ({
  paymentId: 'pay-1',
  kind: 'Booking',
  referenceId: 'b-1',
  status,
  method: 'PromptPay',
  amount: 450,
  refundedCompletedAmount: 0,
  refundPendingAmount: 0,
  lateResolution: 'None',
  bookingStatus: null,
  updatedAtUtc: '2026-10-14T03:00:00Z',
});

describe('startPaymentPolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(reads: (() => Observable<TutoringPaymentState>)[], overrides: Partial<PaymentPollerConfig> = {}) {
    const fetchState = vi.fn(() => {
      const next = reads.shift();
      return next ? next() : of(state('Pending'));
    });
    const onState = vi.fn();
    const onGiveUp = vi.fn();
    const stop = startPaymentPolling({
      fetchState,
      onState,
      onGiveUp,
      isSettled: (s) => s.status !== 'Pending',
      isTabVisible: () => true,
      ...overrides,
    });
    return { fetchState, onState, onGiveUp, stop };
  }

  it('reads after the first interval, not at once, and keeps going while the payment is pending', async () => {
    const { fetchState, onState, stop } = setup([]);

    expect(fetchState).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchState).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenCalledTimes(2);
    stop();
  });

  it('reads at once when asked to (return from a 3-D Secure redirect)', () => {
    const { fetchState, stop } = setup([], { immediate: true });

    expect(fetchState).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reports the settled state and stops by itself', async () => {
    const { fetchState, onState } = setup([() => of(state('Pending')), () => of(state('Succeeded'))]);

    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Succeeded' }));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchState).toHaveBeenCalledTimes(2);
  });

  it('backs off after HTTP 429 (3 s -> 6 s -> 12 s) and returns to the base interval after a good read', async () => {
    const limited = (): Observable<TutoringPaymentState> => throwError(() => new ApiError(429, 'x'));
    const { fetchState } = setup([limited, limited, () => of(state('Pending'))]);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_999);
    expect(fetchState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchState).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(fetchState).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchState).toHaveBeenCalledTimes(3);
    // The third read worked: back to 3 s.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchState).toHaveBeenCalledTimes(4);
  });

  it('never waits longer than the cap, however many reads failed', async () => {
    const limited = (): Observable<TutoringPaymentState> => throwError(() => new ApiError(429, 'x'));
    const { fetchState, stop } = setup(Array.from({ length: 6 }, () => limited), { maxIntervalMs: 10_000, maxConsecutiveErrors: 99 });

    for (let read = 1; read <= 4; read += 1) {
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(fetchState.mock.calls.length).toBeGreaterThanOrEqual(4);
    stop();
  });

  it('gives up after too many failures in a row', async () => {
    const failing = (): Observable<TutoringPaymentState> => throwError(() => new ApiError(503, 'x'));
    const { fetchState, onGiveUp } = setup(Array.from({ length: 5 }, () => failing), { maxConsecutiveErrors: 3, intervalMs: 1_000 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchState).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('gives up at once when the payment is not the caller (404) or the session is gone (401)', async () => {
    for (const status of [404, 401]) {
      const { fetchState, onGiveUp } = setup([() => throwError(() => new ApiError(status, 'x'))]);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(fetchState).toHaveBeenCalledTimes(1);
      expect(onGiveUp).toHaveBeenCalledTimes(1);
    }
  });

  it('does not read while the tab is hidden and resumes when it is visible again', async () => {
    let visible = false;
    const { fetchState, stop } = setup([], { isTabVisible: () => visible });

    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetchState).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchState).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops quietly once shouldContinue says the hold and its grace period are over', async () => {
    let carryOn = true;
    const { fetchState, onGiveUp } = setup([], { shouldContinue: () => carryOn });

    await vi.advanceTimersByTimeAsync(3_000);
    carryOn = false;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchState).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('drops a read that is still in flight when it is stopped', async () => {
    const pending = new Subject<TutoringPaymentState>();
    const { onState, stop } = setup([() => pending]);

    await vi.advanceTimersByTimeAsync(3_000);
    stop();
    pending.next(state('Succeeded'));

    expect(onState).not.toHaveBeenCalled();
  });
});
