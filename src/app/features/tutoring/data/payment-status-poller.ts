import type { Observable } from 'rxjs';

import { ApiError } from '../../../core/http/error.interceptor';
import type { TutoringPaymentState } from './tutoring-payment.models';

export interface PaymentPollerConfig {
  /** One status read (`GET payments/{id}`). */
  readonly fetchState: () => Observable<TutoringPaymentState>;
  /** Called with every state read, the settled one included. */
  readonly onState: (state: TutoringPaymentState) => void;
  /** `true` once the state can no longer change by itself; polling stops after reporting it. */
  readonly isSettled: (state: TutoringPaymentState) => boolean;
  /** Called once, when too many reads in a row failed and polling stops. */
  readonly onGiveUp: () => void;
  /** A hidden tab does not poll (it resumes on the next tick once visible). */
  readonly isTabVisible: () => boolean;
  /** Return `false` to stop quietly (the hold and its grace period are over). */
  readonly shouldContinue?: () => boolean;
  /** Read immediately instead of after the first interval (used when returning from a 3-D Secure redirect). */
  readonly immediate?: boolean;
  readonly intervalMs?: number;
  readonly maxIntervalMs?: number;
  readonly maxConsecutiveErrors?: number;
}

/** Contract P13-06 section 10: poll every 3 s (the endpoint allows 40 per minute per user). */
export const PAYMENT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_MAX_INTERVAL_MS = 30_000;
const DEFAULT_MAX_ERRORS = 10;

/**
 * Polls a payment until it settles and returns a function that stops it.
 * <para>
 * Rate-limit aware: an HTTP 429 (or any failed read) doubles the wait, up to `maxIntervalMs`, and a good read puts it back to
 * the base interval - so a throttled client slows down instead of hammering a limited endpoint. The wait is a chain of
 * `setTimeout`s (never overlapping reads), and a read already in flight is dropped when polling stops.
 * </para>
 * The state it reports comes from the database the signature-verified webhook updates; this never decides a payment outcome
 * itself.
 */
export function startPaymentPolling(config: PaymentPollerConfig): () => void {
  const baseMs = config.intervalMs ?? PAYMENT_POLL_INTERVAL_MS;
  const maxMs = config.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
  const maxErrors = config.maxConsecutiveErrors ?? DEFAULT_MAX_ERRORS;

  let stopped = false;
  let delayMs = baseMs;
  let consecutiveErrors = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: { unsubscribe(): void } | null = null;

  const stop = (): void => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    inFlight?.unsubscribe();
    inFlight = null;
  };

  const schedule = (waitMs: number): void => {
    if (!stopped) {
      timer = setTimeout(tick, waitMs);
    }
  };

  function tick(): void {
    timer = null;
    if (stopped) {
      return;
    }
    if (config.shouldContinue && !config.shouldContinue()) {
      stop();
      return;
    }
    if (!config.isTabVisible()) {
      schedule(baseMs);
      return;
    }

    inFlight = config.fetchState().subscribe({
      next: (state) => {
        inFlight = null;
        consecutiveErrors = 0;
        delayMs = baseMs;
        config.onState(state);
        if (config.isSettled(state)) {
          stop();
        } else {
          schedule(delayMs);
        }
      },
      error: (error: unknown) => {
        inFlight = null;
        consecutiveErrors += 1;
        // A 429 says "slow down"; any other failure is treated the same way rather than retried at full speed.
        delayMs = Math.min(delayMs * 2, maxMs);
        if (consecutiveErrors >= maxErrors || (error instanceof ApiError && (error.status === 401 || error.status === 404))) {
          stop();
          config.onGiveUp();
          return;
        }
        schedule(delayMs);
      },
    });
  }

  if (config.immediate) {
    tick();
  } else {
    schedule(baseMs);
  }
  return stop;
}
