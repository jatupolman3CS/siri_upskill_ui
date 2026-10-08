/**
 * Learner-facing Live DTOs — mirror `siri_upskill_backend/docs/contracts/P11-FE-live-dto-appendix.md` §B.1–B.3 field
 * for field (the C# records in `P11-05` win if the two ever disagree). Shared enums/ids live in `live.models.ts`.
 *
 * Nothing in this file carries a room link except {@link JoinLiveSessionResponse.meetUrl}, and that one value must
 * only ever be held in a component signal for the lifetime of that component — never persisted, routed, or logged
 * (contract `P11-05` §0 rule 1).
 */
import type { Guid, InviteStatus, IsoUtc, LiveDisplayState, LiveSessionStatus } from './live.models';

/** One row of `GET /api/live/courses/{courseId}/my-sessions`. */
export interface MySessionItem {
  readonly id: Guid;
  readonly title: string;
  readonly description: string | null;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  /** Computed by the server at `serverTimeUtc` — never recomputed on the client. */
  readonly displayState: LiveDisplayState;
  readonly status: LiveSessionStatus;
  readonly cancelReason: string | null;
  /** `displayState === 'Live'`: the join window is open. The join button is enabled by this flag only. */
  readonly canJoin: boolean;
  /** `startsAtUtc` minus `Live:JoinWindowBeforeMinutes`. */
  readonly joinOpensAtUtc: IsoUtc;
  /** Whether the meeting room is ready yet (the room link itself is never exposed here). */
  readonly roomReady: boolean;
  readonly hasRecording: boolean;
  readonly recordingEpisodeId: Guid | null;
  /** State of my calendar invitation for this session. */
  readonly inviteStatus: InviteStatus | null;
}

export interface MySessionsResponse {
  readonly courseId: Guid;
  readonly courseSlug: string;
  readonly timezone: 'Asia/Bangkok';
  /** Used to derive the device-clock offset and to time refetches; never trust `Date.now()` to decide a state. */
  readonly serverTimeUtc: IsoUtc;
  /** `true` once I have requested a room link at least once (drives the refund-policy notice). */
  readonly hasAttendedAnySession: boolean;
  /** Ordered by `startsAtUtc` ascending, cancelled sessions included. */
  readonly sessions: readonly MySessionItem[];
}

/** One row of `GET /api/live/me/sessions/upcoming?limit=`. */
export interface MyUpcomingSessionItem {
  readonly sessionId: Guid;
  readonly courseId: Guid;
  readonly courseTitle: string;
  readonly courseSlug: string;
  readonly title: string;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly displayState: LiveDisplayState;
  readonly canJoin: boolean;
  readonly joinOpensAtUtc: IsoUtc;
}

export interface MyUpcomingSessionsResponse {
  readonly serverTimeUtc: IsoUtc;
  readonly items: readonly MyUpcomingSessionItem[];
}

/** `POST /api/live/sessions/{sessionId}/join` (200, `Cache-Control: no-store`). */
export interface JoinLiveSessionResponse {
  readonly sessionId: Guid;
  /** The room link. Hold in a component signal only; clear it on destroy. */
  readonly meetUrl: string;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly serverTimeUtc: IsoUtc;
}
