/**
 * Shared types for every Live (P11) screen — mirrors `siri_upskill_backend/docs/contracts/P11-FE-live-dto-appendix.md` §0
 * (the FROZEN contract). If a C# record in the backend contracts disagrees with a type here, the C# contract wins:
 * report it, do not guess.
 *
 * Learner-facing DTOs live in `live-learner.models.ts`; instructor-facing DTOs in `live-instructor.models.ts`.
 */
import { ApiError } from '../../../core/http/error.interceptor';

export type Guid = string;
/** ISO-8601 UTC with a trailing `Z`, e.g. `2026-10-01T03:00:00Z` — display only through a `Asia/Bangkok` pipe. */
export type IsoUtc = string;

/** Computed on the server (`LiveSessionDisplayStateCalculator`) — the frontend must NEVER compute this itself. */
export type LiveDisplayState = 'Upcoming' | 'Live' | 'Ended' | 'Cancelled';
export type LiveSessionStatus = 'Scheduled' | 'Cancelled';
export type DeliveryFormat = 'OnDemand' | 'Live' | 'Hybrid';
export type MeetingProvider = 'GoogleMeet' | 'Manual' | 'Logging';
export type MeetingSyncStatus =
  | 'Pending'
  | 'AwaitingLink'
  | 'Synced'
  | 'NeedsReconnect'
  | 'Failed'
  | 'PendingDelete'
  | 'Deleted';
export type MeetingNeedsAction = 'None' | 'Waiting' | 'PasteLink' | 'ReconnectGoogle' | 'Retry';
export type InviteStatus = 'Pending' | 'Invited' | 'Cancelled' | 'Skipped';

/**
 * Stable sub-codes carried in `ApiProblem.reason` — each maps to an i18n key under `live.errors.*`.
 * `string & {}` keeps the union open so an unknown future reason still type-checks.
 */
export type LiveProblemReason =
  | 'live.not_found'
  | 'live.session_cancelled'
  | 'live.session_ended'
  | 'live.window_not_open'
  | 'live.meeting_not_ready'
  | 'live.meetings_not_ready'
  | 'live.google_not_configured'
  | 'live.meeting_link_invalid'
  | 'live.meeting_link_host_not_allowed'
  | 'live.session_not_editable'
  | 'live.meeting_not_resyncable'
  | 'live.session_not_started'
  | 'live.recording_asset_not_ready'
  | 'live.recording_asset_in_use'
  | 'live.recording_episode_has_no_media'
  | 'live.recording_episode_in_use'
  | 'refund.live_attended'
  | (string & {});

/** RFC 9457 body of every Live error (`ApiError.details` holds this — see `core/http/error.interceptor.ts`). */
export interface ApiProblem {
  readonly status?: number;
  readonly title?: string;
  readonly traceId?: string;
  readonly errorCode?: string;
  readonly reason?: LiveProblemReason;
  /** `live.window_not_open` */
  readonly opensAtUtc?: IsoUtc;
  readonly serverTimeUtc?: IsoUtc;
  /** `live.session_ended` */
  readonly recordingEpisodeId?: Guid;
  readonly courseSlug?: string;
  /** `live.meetings_not_ready` */
  readonly sessionIds?: readonly Guid[];
  /** `refund.live_attended` */
  readonly blockedCourseTitles?: readonly string[];
  readonly maxRefundableAmount?: number;
  readonly blockedAmount?: number;
}

/** Extracts the structured problem body from a caught error, or `null` when the error is not an `ApiError`. */
export function problemOf(error: unknown): ApiProblem | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const details = error.details;
  if (typeof details !== 'object' || details === null) {
    return { status: error.status, errorCode: error.code };
  }
  return { status: error.status, errorCode: error.code, ...(details as ApiProblem) };
}
