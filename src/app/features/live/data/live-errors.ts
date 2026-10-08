import { ApiError } from '../../../core/http/error.interceptor';
import { problemOf } from './live.models';

/**
 * `ApiProblem.reason` -> `live.errors.*` i18n key, one entry per row of the appendix §0 table. Every Live screen
 * (learner and instructor) resolves server errors through this single map so a given failure reads the same everywhere.
 */
const REASON_KEYS: Readonly<Record<string, string>> = {
  'live.not_found': 'live.errors.notFoundOrNoAccess',
  'live.session_cancelled': 'live.errors.cancelled',
  'live.session_ended': 'live.errors.ended',
  'live.window_not_open': 'live.errors.notOpenYet',
  'live.meeting_not_ready': 'live.errors.roomNotReady',
  'live.meetings_not_ready': 'live.errors.meetingsNotReady',
  'live.google_not_configured': 'live.errors.googleNotConfigured',
  'live.meeting_link_invalid': 'live.errors.linkInvalid',
  'live.meeting_link_host_not_allowed': 'live.errors.linkHostNotAllowed',
  'live.session_text_contains_meeting_link': 'live.errors.sessionTextContainsMeetingLink',
  'live.session_not_editable': 'live.errors.sessionNotEditable',
  'live.meeting_not_resyncable': 'live.errors.meetingNotResyncable',
  'live.session_not_started': 'live.errors.sessionNotStarted',
  'live.recording_asset_not_ready': 'live.errors.recordingAssetNotReady',
  'live.recording_asset_in_use': 'live.errors.recordingAssetInUse',
  'live.recording_episode_has_no_media': 'live.errors.recordingEpisodeHasNoMedia',
  'live.recording_episode_in_use': 'live.errors.recordingEpisodeInUse',
  'refund.live_attended': 'live.errors.refundLiveAttended',
};

/** HTTP 429 carries no `reason` (appendix §0) — it is recognised by status alone. */
const RATE_LIMITED_KEY = 'live.errors.rateLimited';
const GENERIC_KEY = 'live.errors.generic';

/**
 * Picks the i18n key that explains a failed Live call to the user. Unknown reasons and non-`ApiError` failures fall
 * back to the generic message rather than echoing server text (the server `title` is never shown verbatim).
 */
export function liveErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return GENERIC_KEY;
  }
  if (error.status === 429) {
    return RATE_LIMITED_KEY;
  }
  const reason = problemOf(error)?.reason;
  return (reason !== undefined ? REASON_KEYS[reason] : undefined) ?? GENERIC_KEY;
}

/** What the refund screen needs from a `409 refund.live_attended` (appendix §D, contract `P11-12`). */
export interface LiveRefundBlock {
  /** Titles of the courses whose live attendance blocks the refund. Display only. */
  readonly blockedCourseTitles: readonly string[];
  /** The most the server will refund for this payment; `0` means no refund is possible at all. */
  readonly maxRefundableAmount: number;
  readonly blockedAmount: number;
}

/**
 * Recognises the live-attendance refund refusal and extracts the server's own figures; every other failure returns
 * `null` so the caller keeps its generic error handling. The amounts are the server's decision — never recomputed here.
 */
export function liveRefundBlockOf(error: unknown): LiveRefundBlock | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }
  const problem = problemOf(error);
  if (problem?.reason !== 'refund.live_attended') {
    return null;
  }
  return {
    blockedCourseTitles: problem.blockedCourseTitles ?? [],
    maxRefundableAmount: Math.max(0, problem.maxRefundableAmount ?? 0),
    blockedAmount: problem.blockedAmount ?? 0,
  };
}
