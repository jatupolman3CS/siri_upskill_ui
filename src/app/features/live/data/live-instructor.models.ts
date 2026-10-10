/**
 * Instructor-side Live DTOs — mirrors `siri_upskill_backend/docs/contracts/P11-FE-live-dto-appendix.md` §A (Google +
 * meetings), §B.5 (sessions/roster) and §C (Catalog live-schedule writes). FROZEN contract: if a C# record disagrees
 * with a type here, the C# record wins — report it, do not guess.
 *
 * Learner-facing DTOs live in `live-learner.models.ts` (owned by a different work package).
 */
import type { CourseStatus } from '../../catalog/data/course-api.models';
import type {
  DeliveryFormat,
  Guid,
  InviteStatus,
  IsoUtc,
  LiveDisplayState,
  LiveSessionStatus,
  MeetingNeedsAction,
  MeetingProvider,
  MeetingSyncStatus,
} from './live.models';

// --- A. Google connection (P11-03) -----------------------------------------------------------------------------------

export type GoogleRevokedReason =
  | 'invalid_grant'
  | 'user_disconnected'
  | 'scope_missing'
  | 'insufficient_scope';

/**
 * Detected by the server from Google's `hd` (hosted domain) claim — never asked. `Unknown` = connected before the check
 * existed; it resolves on a later status read (show "checking…").
 */
export type GoogleAccountKind = 'Personal' | 'Workspace' | 'Unknown';

/** What the instructor's account can do about recordings (contract `P11-13` §6/§7). */
export type RecordingCapabilityMode = 'Manual' | 'AutoNeedsConsent' | 'Auto';

export interface RecordingCapability {
  readonly mode: RecordingCapabilityMode;
  /** The server feature flag (`Live:Recording:AutoImport:Enabled`) is on. `false` -> only the manual path exists. */
  readonly autoImportAvailable: boolean;
  /** Both recording scopes were granted by the instructor. */
  readonly scopesGranted: boolean;
}

/** `GET /api/live/instructor/google/status`. */
export interface GoogleConnectionStatus {
  /** The server has an OAuth client configured; `false` means "manual link only" (hide the connect button). */
  readonly configured: boolean;
  readonly connected: boolean;
  /** Was connected once but the token is no longer usable (revoked / expired). */
  readonly needsReconnect: boolean;
  readonly googleEmail: string | null;
  readonly connectedAtUtc: IsoUtc | null;
  readonly lastValidatedAtUtc: IsoUtc | null;
  readonly revokedReason: GoogleRevokedReason | null;
  /** Future sessions of this instructor waiting for a reconnect / a pasted link. */
  readonly affectedSessionCount: number;
  /** `null` when not connected. */
  readonly accountKind: GoogleAccountKind | null;
  /** The Workspace domain (`example.com`), `null` for a personal account or when not connected. */
  readonly hostedDomain: string | null;
  readonly recording: RecordingCapability;
}

/** `POST /api/live/instructor/google/connect` — `returnPath` must start with `/instructor/` (server-validated). */
export interface GoogleConnectRequest {
  readonly returnPath?: string;
}

export interface GoogleConnectResponse {
  readonly authorizationUrl: string;
}

/** `POST /api/live/instructor/google/recording-access/connect` (contract `P11-13` §7) — same `returnPath` rule. */
export type RecordingAccessConnectRequest = GoogleConnectRequest;

/** Query params the API's callback redirect appends to `returnPath` (appendix §A.3 + `P11-13`). */
export type GoogleCallbackReason =
  | 'access_denied'
  | 'state_invalid'
  | 'scope_missing'
  | 'no_refresh_token'
  | 'exchange_failed'
  /** The recording consent was granted without both recording scopes — nothing was stored. */
  | 'recording_scope_missing';

export type GoogleCallbackResult =
  | { readonly outcome: 'connected' }
  | { readonly outcome: 'error'; readonly reason: GoogleCallbackReason | null };

// --- A.5 Meetings (NEVER carry a URL) --------------------------------------------------------------------------------

export interface InstructorMeetingSummary {
  readonly sessionId: Guid;
  /** `null` = the system has not decided yet (<= 1 minute after the session was created). */
  readonly provider: MeetingProvider | null;
  readonly syncStatus: MeetingSyncStatus;
  /** A link is stored (its value is never exposed here). */
  readonly hasMeetingLink: boolean;
  /** `hasMeetingLink && not Deleted` — what gates publish / join. */
  readonly isUsable: boolean;
  readonly lastSyncAtUtc: IsoUtc | null;
  readonly needsAction: MeetingNeedsAction;
  /** Short code ('conference_pending', 'google_account_unavailable', 'invalid_grant', …) — map to i18n, never show raw. */
  readonly errorCode: string | null;
}

export interface CourseMeetingsResponse {
  readonly items: readonly InstructorMeetingSummary[];
}

export interface SetMeetingLinkRequest {
  readonly meetUrl: string;
}

// --- P11-13 Recording import (automatic for Google Workspace, by hand otherwise) -----------------------------------------

/**
 * Where an automatic import stands. `null` on {@link RecordingImportInfo.status} = no import row exists (personal account,
 * feature off, or the session has not needed one). The server never sends a Drive id, asset id, URL or message text.
 */
export type RecordingImportStatus =
  | 'Waiting'
  | 'Transferring'
  | 'Processing'
  | 'Attached'
  | 'NoRecording'
  | 'Failed'
  | 'NeedsReconnect'
  | 'Skipped';

/** `recordingImport` on the instructor session list item / detail, and the response of the retry call. */
export interface RecordingImportInfo {
  /** `Auto` when an import row exists or the instructor's capability is `Auto`, else `Manual`. */
  readonly mode: 'Manual' | 'Auto';
  readonly status: RecordingImportStatus | null;
  /** Short stable code ('file_too_large', 'transcode_failed', …) — map to i18n, never show raw. */
  readonly errorCode: string | null;
  readonly nextAttemptAtUtc: IsoUtc | null;
  /** The server decides (state + 30-day window); the UI only shows the button. */
  readonly canRetry: boolean;
}

// --- B.5 Instructor sessions / roster --------------------------------------------------------------------------------

export type InstructorSessionScope = 'upcoming' | 'past' | 'all';

export interface InstructorSessionListItem {
  readonly sessionId: Guid;
  readonly courseId: Guid;
  readonly courseTitle: string;
  readonly title: string;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly displayState: LiveDisplayState;
  readonly expectedLearners: number;
  readonly joinedLearners: number;
  readonly meeting: InstructorMeetingSummary;
  readonly recordingEpisodeId: Guid | null;
  readonly cancelReason: string | null;
  readonly recordingImport: RecordingImportInfo;
}

export interface InstructorSessionListQuery {
  readonly scope: InstructorSessionScope;
  readonly courseId?: Guid;
  readonly page?: number;
  readonly pageSize?: number;
}

/** `GET /api/live/instructor/sessions/{id}` — the one response (besides the learner join) that carries `meetUrl`. */
export interface InstructorSessionDetail {
  readonly sessionId: Guid;
  readonly courseId: Guid;
  readonly courseTitle: string;
  readonly courseSlug: string;
  readonly title: string;
  readonly description: string | null;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly displayState: LiveDisplayState;
  readonly status: LiveSessionStatus;
  readonly cancelReason: string | null;
  readonly recordingEpisodeId: Guid | null;
  /** Owning instructor only; `null` while no room exists yet. */
  readonly meetUrl: string | null;
  readonly meeting: InstructorMeetingSummary;
  readonly recordingImport: RecordingImportInfo;
  readonly enrolledCount: number;
  readonly expectedLearners: number;
  readonly joinedLearners: number;
  readonly serverTimeUtc: IsoUtc;
}

export type RosterFilter = 'all' | 'joined' | 'notJoined';

export interface RosterItem {
  readonly userId: Guid;
  readonly displayName: string | null;
  /** `a***@g***.com` — the full address is never sent. */
  readonly emailMasked: string | null;
  readonly inviteStatus: InviteStatus | null;
  readonly joined: boolean;
  readonly firstJoinedAtUtc: IsoUtc | null;
  readonly joinCount: number;
}

export interface RosterQuery {
  readonly filter: RosterFilter;
  readonly page?: number;
  readonly pageSize?: number;
}

// --- C. Catalog live-schedule (read + writes) ------------------------------------------------------------------------

/** `LiveSessionResponse` (P11-02). */
export interface LiveSession {
  readonly id: Guid;
  readonly courseId: Guid;
  readonly title: string;
  readonly description: string | null;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly sortOrder: number;
  readonly status: LiveSessionStatus;
  readonly cancelReason: string | null;
  readonly recordingEpisodeId: Guid | null;
}

/** `GET /api/catalog/instructor/courses/{courseId}/live-schedule`. */
export interface CourseLiveSchedule {
  readonly courseId: Guid;
  readonly deliveryFormat: DeliveryFormat;
  readonly status: CourseStatus;
  readonly enrollmentDeadlineUtc: IsoUtc | null;
  readonly maxSeats: number | null;
  readonly seatsUsed: number;
  readonly googleAttendeeSyncEnabled: boolean;
  readonly sessions: readonly LiveSession[];
}

/** Create / update body — instants are UTC ISO with a trailing `Z` (never an offset like `+07:00`). */
export interface LiveSessionWriteRequest {
  readonly title: string;
  readonly description?: string | null;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
}

export interface CancelLiveSessionRequest {
  readonly reason: string;
}

export interface SetDeliveryFormatRequest {
  readonly deliveryFormat: DeliveryFormat;
}

export interface SetDeliveryFormatResponse {
  readonly id: Guid;
  readonly deliveryFormat: DeliveryFormat;
}

export interface SetEnrollmentPolicyRequest {
  readonly enrollmentDeadlineUtc?: IsoUtc | null;
  readonly maxSeats?: number | null;
}

export interface SetEnrollmentPolicyResponse {
  readonly id: Guid;
  readonly enrollmentDeadlineUtc: IsoUtc | null;
  readonly maxSeats: number | null;
  readonly seatsUsed: number;
}

/** `PUT /api/catalog/instructor/courses/{courseId}/live-settings` (C.4). */
export interface SetLiveSettingsRequest {
  readonly googleAttendeeSyncEnabled: boolean;
}

export interface SetLiveSettingsResponse {
  readonly courseId: Guid;
  readonly googleAttendeeSyncEnabled: boolean;
}

/** C.3 — `mediaAssetId` XOR `episodeId`. */
export interface AttachSessionRecordingRequest {
  readonly mediaAssetId?: Guid;
  readonly episodeId?: Guid;
  readonly sectionId?: Guid;
  readonly episodeTitle?: string;
}

export interface LiveSessionRecording {
  readonly sessionId: Guid;
  readonly recordingEpisodeId: Guid;
  readonly sectionId: Guid;
  readonly episodeTitle: string;
  readonly durationSeconds: number;
  readonly mediaAssetId: Guid;
  readonly replacedExisting: boolean;
}
