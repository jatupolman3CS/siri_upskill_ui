import { ApiError } from '../../../../core/http/error.interceptor';
import { clockOffsetMs } from '../../../live/learner/live-clock';
import type { Guid, IsoUtc, TutoringParticipantRole } from '../../data/tutoring-classes.models';
import { tutoringProblemOf } from '../../data/tutoring-errors';

export {
  NOT_OPEN_FALLBACK_RETRY_MS,
  ROOM_RETRY_INTERVAL_MS,
  ROOM_RETRY_MAX_ATTEMPTS,
  isSafeRoomUrl,
  isSessionId,
} from '../../../live/learner/live-join-page/live-join-state';

/** How long after the start the learner is asked whether the tutor is in the room (P13-10 section 4.5 / appendix). */
export const TUTOR_PRESENT_PROMPT_AFTER_MS = 5 * 60_000;

/** Every screen the join page can be in. Exactly one at a time; `kind` drives copy, icon, focus and the live-region text. */
export type TutoringJoinState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready'; readonly role: TutoringParticipantRole; readonly startsAtUtc: IsoUtc; readonly offsetMs: number }
  | { readonly kind: 'notOpen'; readonly opensAtUtc: IsoUtc | null; readonly offsetMs: number }
  | { readonly kind: 'ended' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'closed' }
  | { readonly kind: 'roomNotReady'; readonly attempt: number; readonly exhausted: boolean; readonly needsAction: string | null }
  | { readonly kind: 'notFoundOrNoAccess' }
  | { readonly kind: 'rateLimited' }
  | { readonly kind: 'error' };

export type TutoringJoinKind = TutoringJoinState['kind'];

/**
 * What a failed `POST /sessions/{id}/join` means for the page (P13-10 appendix table). `unauthenticated` is not a screen (the
 * page sends the person to sign in and back); `roomNotReady` carries no counters because the page owns the retry timer.
 */
export type TutoringJoinFailure =
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'roomNotReady'; readonly needsAction: string | null }
  | Exclude<TutoringJoinState, { readonly kind: 'checking' | 'ready' | 'roomNotReady' }>;

export function tutoringJoinFailureOf(error: unknown): TutoringJoinFailure {
  if (!(error instanceof ApiError)) {
    return { kind: 'error' };
  }
  if (error.status === 401) {
    return { kind: 'unauthenticated' };
  }
  if (error.status === 429) {
    return { kind: 'rateLimited' };
  }

  const problem = tutoringProblemOf(error);
  switch (problem?.reason) {
    case 'tutoring.not_found':
      return { kind: 'notFoundOrNoAccess' };
    case 'tutoring.session_cancelled':
      return { kind: 'cancelled' };
    case 'tutoring.session_closed':
      return { kind: 'closed' };
    case 'tutoring.session_ended':
      return { kind: 'ended' };
    case 'tutoring.window_not_open':
      return {
        kind: 'notOpen',
        opensAtUtc: problem.opensAtUtc ?? null,
        offsetMs: problem.serverTimeUtc ? clockOffsetMs(problem.serverTimeUtc) : 0,
      };
    case 'tutoring.room_not_ready':
      return { kind: 'roomNotReady', needsAction: problem.needsAction ?? null };
    default:
      // A 404 with no recognised reason is still "not found / no access" - the two are deliberately indistinguishable.
      return error.status === 404 ? { kind: 'notFoundOrNoAccess' } : { kind: 'error' };
  }
}

/** The tutor's classroom-management page for a class: where a tutor goes when the room needs them. */
export function tutorClassRoute(sessionId: Guid): readonly string[] {
  return ['/instructor/tutoring/classes', sessionId];
}

/** `needsAction` values on which the TUTOR has something to do about the room (the server only sends it to the tutor). */
export function tutorMustActOnRoom(needsAction: string | null): boolean {
  return needsAction === 'PasteLink' || needsAction === 'ReconnectGoogle' || needsAction === 'Retry';
}
