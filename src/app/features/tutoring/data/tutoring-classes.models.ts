/**
 * Tutor-side class (session) DTOs (P13-25). They mirror, field for field, the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-10-tutoring-join-attendance-finalize-materials.md` (start / complete / summary /
 * attendance / room / materials) and `P13-08-cancellation-refund-noshow-engine.md` section 12 (tutor cancellation quote and
 * cancel). If a C# record disagrees with a type here, the C# record wins: report it, do not guess.
 *
 * Nothing here is a decision. Whether a class may be started, completed or cancelled, who counts as present and what a cancel
 * costs are all the server's: the client shows the answers and sends the tutor's intent.
 */
import type { BookingOfferingSummary, BookingStatus, LearnerGrade } from './tutoring-learner.models';
import type { Guid, IsoUtc, PagedResult } from './tutoring-tutor.models';
import type { SessionFormat } from './tutoring-public.models';

export type { Guid, IsoUtc, PagedResult };

export type SessionStatus = 'Held' | 'Scheduled' | 'Cancelled' | 'Completed' | 'NoShowTutor' | 'NoShowBoth';

/** What the tutor may see of a learner: a nickname and a school grade - never an e-mail, phone number or account name (P13-05 section 6.1). */
export interface TutorVisibleLearner {
  readonly nickname: string;
  readonly gradeLevel: LearnerGrade | null;
  readonly isMinor: boolean;
}

// --- Class list (P13-10 section 7.5, revision 4) -----------------------------------------------------------------------------

/** A learner of a listed class: `TutorVisibleLearner` (a nickname and a school grade, nothing more) plus the booking and its status. */
export interface TutorClassLearner extends TutorVisibleLearner {
  readonly bookingId: Guid;
  readonly status: BookingStatus;
  readonly disputeId?: Guid | null;
}

/** What the tutor may know of the room from the list: its state and what, if anything, the tutor has to do. No URL, no id. */
export interface TutorClassRoom {
  readonly state: LiveRoomState;
  readonly needsAction: LiveRoomNeedsAction;
}

/**
 * One row of `GET /api/tutoring/tutor/classes?scope=upcoming|history&page&pageSize` (`InstructorOnly`, so a suspended tutor still sees
 * what is pending). Every flag is computed by the server on its own clock (`serverTimeUtc`) from the rules of start / complete / summary:
 *
 * - `canStart` / `canComplete` are display hints - the right to start or complete is decided when the tutor presses the button
 *   (`POST .../start`, `POST .../complete`). They are `false` for a tutor who is not verified.
 * - `startOpensAtUtc` / `completeOpensAtUtc` are when those actions open (`null` unless the class is `Scheduled`); `learnerPresent` says
 *   whether any confirmed learner has joined or confirmed, which completing needs.
 * - `needsSummary` + `summaryEditableUntilUtc`: a completed class whose learners have no lesson summary yet, and until when it can be written.
 * - There is no `canCancel`: cancelling is offered for a `Scheduled` class and the cancellation quote says what it would cost.
 *
 * `learners` leaves out `PendingPayment` / `Expired` bookings; a group class also reports `seatsTaken` (which counts unpaid holds) and
 * `capacity`, both `null` for one-on-one.
 */
export interface TutorClassListItem {
  readonly sessionId: Guid;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly status: SessionStatus;
  readonly format: SessionFormat;
  readonly isTrial: boolean;
  readonly offering: BookingOfferingSummary;
  readonly learners: readonly TutorClassLearner[];
  readonly seatsTaken: number | null;
  readonly capacity: number | null;
  readonly startOpensAtUtc: IsoUtc | null;
  readonly canStart: boolean;
  readonly completeOpensAtUtc: IsoUtc | null;
  readonly canComplete: boolean;
  readonly learnerPresent: boolean;
  readonly needsSummary: boolean;
  readonly summaryEditableUntilUtc: IsoUtc | null;
  readonly room: TutorClassRoom | null;
  readonly serverTimeUtc: IsoUtc;
}

export type TutorClassScope = 'upcoming' | 'history';

// --- Start (the primary path to the room) -----------------------------------------------------------------------------------

export type TutoringParticipantRole = 'Learner' | 'Tutor';

/**
 * `POST /tutor/classes/{sessionId}/start`. `meetUrl` is a capability: keep it in a component signal only - never in storage,
 * router state, a URL, analytics or a log.
 */
export interface JoinTutoringSessionResponse {
  readonly sessionId: Guid;
  readonly role: TutoringParticipantRole;
  readonly meetUrl: string;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly serverTimeUtc: IsoUtc;
}

// --- Room -------------------------------------------------------------------------------------------------------------------

export type LiveRoomState = 'Pending' | 'AwaitingLink' | 'Ready' | 'NeedsReconnect' | 'Failed' | 'Cancelled';
export type LiveRoomNeedsAction = 'None' | 'Waiting' | 'PasteLink' | 'ReconnectGoogle' | 'Retry';

/** `GET /tutor/classes/{sessionId}/room` - never carries the room URL. */
export interface RoomStatusDto {
  readonly state: LiveRoomState;
  readonly needsAction: LiveRoomNeedsAction;
  readonly provider: 'GoogleMeet' | 'Manual' | 'Logging' | null;
  readonly hasMeetingLink: boolean;
  readonly isUsable: boolean;
  readonly lastSyncAtUtc: IsoUtc | null;
  readonly errorCode: string | null;
}

export interface SetMeetingLinkRequest {
  readonly meetUrl: string;
}

// --- Complete + summary -----------------------------------------------------------------------------------------------------

export interface LearnerFeedbackInput {
  readonly bookingId: Guid;
  readonly feedback: string;
}

/** Body of `POST /complete` and of `PUT /summary` (the same shape). Optional texts are sent as `null`, never as `""`. */
export interface CompleteClassRequest {
  readonly topicsCovered: string;
  readonly homework: string | null;
  readonly nextSteps: string | null;
  readonly learnerFeedback: readonly LearnerFeedbackInput[];
}

export interface CompleteClassResponse {
  readonly sessionId: Guid;
  readonly status: SessionStatus;
  readonly alreadyCompleted: boolean;
  readonly completedBookings: number;
  readonly noShowLearnerBookings: number;
  readonly pendingBookings: number;
}

export interface TutorSummaryLearner {
  readonly bookingId: Guid;
  readonly nickname: string;
  readonly feedback: string | null;
}

export interface TutorSummaryResponse {
  readonly sessionId: Guid;
  readonly topicsCovered: string | null;
  readonly homework: string | null;
  readonly nextSteps: string | null;
  readonly learners: readonly TutorSummaryLearner[];
}

// --- Attendance -------------------------------------------------------------------------------------------------------------

export interface TutorAttendanceLearner extends TutorVisibleLearner {
  readonly bookingId: Guid;
  readonly status: BookingStatus;
  readonly joinedAtUtc: IsoUtc | null;
  readonly attestedTutorPresentAtUtc: IsoUtc | null;
  readonly confirmedAtUtc: IsoUtc | null;
  readonly disputeId?: Guid | null;
}

export interface TutorAttendanceResponse {
  readonly sessionId: Guid;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly status: SessionStatus;
  readonly tutorJoinedAtUtc: IsoUtc | null;
  readonly tutorConfirmedAtUtc: IsoUtc | null;
  readonly finalizedAtUtc: IsoUtc | null;
  readonly learners: readonly TutorAttendanceLearner[];
}

// --- Materials --------------------------------------------------------------------------------------------------------------

export type MaterialKind = 'File' | 'Link' | 'Homework';

export interface MaterialDto {
  readonly id: Guid;
  readonly kind: MaterialKind;
  readonly title: string;
  readonly url: string | null;
  readonly bodyText: string | null;
  readonly fileName: string | null;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly addedAtUtc: IsoUtc;
}

/** A file is sent as `multipart/form-data` instead (part `file`, optional part `title`). */
export interface AddMaterialRequest {
  readonly kind: 'Link' | 'Homework';
  readonly title: string;
  readonly url: string | null;
  readonly bodyText: string | null;
}

export interface MaterialDownloadResponse {
  readonly id: Guid;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** Short-lived signed URL: use it straight away, never store it. */
  readonly downloadUrl: string;
  readonly expiresAtUtc: IsoUtc;
}

// --- Tutor cancellation (P13-08 section 5.5) --------------------------------------------------------------------------------

export type RefundSettlement = 'None' | 'Money' | 'CreditRestore';
export type RefundDisplayStatus = 'Requested' | 'Processing' | 'Completed' | 'Failed';
export type TutorPenaltyKind = 'LateCancel' | 'NoShow';

/**
 * `GET /tutor/classes/{sessionId}/cancellation-quote`: what cancelling would cost, computed by the server's cancellation policy
 * at the moment of the call. The client never recomputes any of it.
 */
export interface TutorCancellationQuote {
  readonly sessionId: Guid;
  readonly canCancel: boolean;
  readonly refusalReason: string | null;
  readonly affectedBookings: number;
  readonly totalRefundAmount: number;
  readonly penaltyKind: TutorPenaltyKind | null;
  readonly penaltyPoints: number;
  readonly currentReliabilityScore: number;
  readonly projectedReliabilityScore: number;
  readonly willTriggerSuspension: boolean;
  readonly startsAtUtc: IsoUtc;
}

export interface CancelClassRequest {
  readonly reason: string;
}

export interface CancelledBookingResult {
  readonly bookingId: Guid;
  readonly bookingNo: string;
  readonly refundAmount: number;
  readonly settlement: RefundSettlement;
  readonly refundStatus: RefundDisplayStatus | null;
}

export interface CancelClassResponse {
  readonly sessionId: Guid;
  readonly status: string;
  readonly alreadyCancelled: boolean;
  readonly bookings: readonly CancelledBookingResult[];
  readonly penaltyKind: TutorPenaltyKind | null;
  readonly penaltyPoints: number;
  readonly reliabilityScore: number;
  readonly suspended: boolean;
}
