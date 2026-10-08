import { ApiError } from '../../../../core/http/error.interceptor';
import { problemOf } from '../../data/live.models';
import type { Guid, IsoUtc } from '../../data/live.models';
import { clockOffsetMs } from '../live-clock';

/** Pause before leaving for the room, so the "taking you to the room" message is actually seen and announced. */
export const REDIRECT_DELAY_MS = 600;
/** Retry cadence while the room is still being prepared (`503 live.meeting_not_ready`, appendix §F). */
export const ROOM_RETRY_INTERVAL_MS = 30_000;
/** Give up on automatic retries after this many "room not ready" answers and hand control back to the learner. */
export const ROOM_RETRY_MAX_ATTEMPTS = 10;
/** Retry wait used when the server still says "not open" although our clock says the window has opened. */
export const NOT_OPEN_FALLBACK_RETRY_MS = 10_000;

/** Every screen the join page can be in. Exactly one at a time; `kind` drives copy, icon, focus and live-region text. */
export type JoinState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'redirecting' }
  | { readonly kind: 'notOpen'; readonly opensAtUtc: IsoUtc | null; readonly offsetMs: number }
  | { readonly kind: 'ended'; readonly recordingEpisodeId: Guid | null; readonly courseSlug: string | null }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'roomNotReady'; readonly attempt: number; readonly exhausted: boolean }
  | { readonly kind: 'notFoundOrNoAccess' }
  | { readonly kind: 'rateLimited' }
  | { readonly kind: 'error' };

export type JoinStateKind = JoinState['kind'];

/**
 * What a failed `POST /join` means for the page. `unauthenticated` is not a screen (the page sends the learner to sign in
 * and back); `roomNotReady` carries no counters because attempts are counted by the page, which owns the retry timer.
 */
export type JoinFailure =
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'roomNotReady' }
  | Exclude<JoinState, { readonly kind: 'checking' | 'redirecting' | 'roomNotReady' }>;

/** Maps a failed join call (appendix §0 table) to the screen to show. Anything unrecognised is the generic `error`. */
export function joinFailureOf(error: unknown): JoinFailure {
  if (!(error instanceof ApiError)) {
    return { kind: 'error' };
  }
  if (error.status === 401) {
    return { kind: 'unauthenticated' };
  }
  if (error.status === 429) {
    return { kind: 'rateLimited' };
  }

  const problem = problemOf(error);
  switch (problem?.reason) {
    case 'live.not_found':
      return { kind: 'notFoundOrNoAccess' };
    case 'live.session_cancelled':
      return { kind: 'cancelled' };
    case 'live.session_ended':
      return {
        kind: 'ended',
        recordingEpisodeId: problem.recordingEpisodeId ?? null,
        courseSlug: problem.courseSlug ?? null,
      };
    case 'live.window_not_open':
      return {
        kind: 'notOpen',
        opensAtUtc: problem.opensAtUtc ?? null,
        offsetMs: problem.serverTimeUtc ? clockOffsetMs(problem.serverTimeUtc) : 0,
      };
    case 'live.meeting_not_ready':
      return { kind: 'roomNotReady' };
    default:
      // A 404 with no recognised reason is still "not found / no access" — the two are deliberately indistinguishable.
      return error.status === 404 ? { kind: 'notFoundOrNoAccess' } : { kind: 'error' };
  }
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id can never name a session; the page shows "not found" without bothering the server. */
export function isSessionId(value: string): boolean {
  return GUID_PATTERN.test(value);
}

/**
 * Defence in depth before we send the browser away: the server already allow-lists the host, but the page only ever
 * navigates to an absolute `https:` URL, so a malformed or `javascript:`/`data:` value can never become a redirect.
 */
export function isSafeRoomUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
