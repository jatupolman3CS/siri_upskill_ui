import type { IsoUtc, LiveDisplayState } from '../data/live.models';

/**
 * Pure helpers for reasoning about time on the learner Live screens. The server is the only authority on session
 * state (`displayState`/`canJoin` are computed there — see `P11-FE-live-dto-appendix.md` §0); the device clock is used
 * for exactly two things: drawing a countdown and deciding *when to ask the server again*. Both go through the offset
 * between the server's clock and this device's clock, taken from the `serverTimeUtc` of the latest response, so a
 * visitor whose laptop clock is minutes off still sees (and refetches at) the right moments.
 */

/** Largest delay `setTimeout` can honour (a signed 32-bit int); anything beyond it would fire immediately. */
export const MAX_TIMER_MS = 2_147_483_647;

/** Slack added to a boundary refetch so the request lands just after the server has crossed it, not just before. */
export const BOUNDARY_SLACK_MS = 1_000;

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `serverNow - deviceNow`, in ms. Returns `0` (trust the device clock) when the server stamp is unparseable. */
export function clockOffsetMs(serverTimeUtc: IsoUtc, deviceNowMs: number = Date.now()): number {
  const serverMs = Date.parse(serverTimeUtc);
  return Number.isNaN(serverMs) ? 0 : serverMs - deviceNowMs;
}

/** Milliseconds from (server-corrected) now until `targetUtc`; negative once passed, `null` for an unparseable instant. */
export function msUntil(targetUtc: IsoUtc, offsetMs: number, deviceNowMs: number = Date.now()): number | null {
  const targetMs = Date.parse(targetUtc);
  return Number.isNaN(targetMs) ? null : targetMs - (deviceNowMs + offsetMs);
}

export interface CountdownParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

/** Splits a non-negative duration into whole days/hours/minutes/seconds (negative input is treated as zero). */
export function countdownParts(totalMs: number): CountdownParts {
  const safe = Math.max(0, Math.floor(totalMs));
  return {
    days: Math.floor(safe / DAY_MS),
    hours: Math.floor((safe % DAY_MS) / HOUR_MS),
    minutes: Math.floor((safe % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((safe % MINUTE_MS) / SECOND_MS),
  };
}

/** The slice of a session the boundary scheduler needs — both `MySessionItem` and `MyUpcomingSessionItem` fit. */
export interface BoundarySession {
  readonly displayState: LiveDisplayState;
  readonly joinOpensAtUtc: IsoUtc;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
}

/**
 * Delay until the next moment at which the server's view of any session can change (join window opens, session starts,
 * session ends), or `null` when nothing can change (every session is already ended/cancelled) or the moment is too far
 * away for a timer. The caller refetches when it fires and calls this again with the fresh data, so it never computes
 * `displayState` itself.
 *
 * The result is always at least {@link BOUNDARY_SLACK_MS}, which also guarantees a refetch loop can never spin faster
 * than once a second even if the two clocks disagree about a boundary.
 */
export function nextBoundaryDelayMs(
  sessions: readonly BoundarySession[],
  offsetMs: number,
  deviceNowMs: number = Date.now(),
): number | null {
  let soonest: number | null = null;
  for (const session of sessions) {
    if (session.displayState === 'Ended' || session.displayState === 'Cancelled') {
      continue;
    }
    for (const boundary of [session.joinOpensAtUtc, session.startsAtUtc, session.endsAtUtc]) {
      const remaining = msUntil(boundary, offsetMs, deviceNowMs);
      if (remaining !== null && remaining > 0 && (soonest === null || remaining < soonest)) {
        soonest = remaining;
      }
    }
  }
  if (soonest === null) {
    return null;
  }
  const delay = soonest + BOUNDARY_SLACK_MS;
  return delay > MAX_TIMER_MS ? null : delay;
}
