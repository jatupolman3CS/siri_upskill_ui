/**
 * Administrator side of tutoring disputes (P13-26). Mirrors, field for field, the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-14-disputes.md` (section 14) - at the time of writing there is NO C# for the
 * administrator endpoints yet (the contract is FROZEN, the code is not built), so this file is the contract's shape and nothing
 * else. When the controller lands, diff it against these types; if a C# record disagrees, the C# record wins: report it.
 *
 * What the administrator may and may not see (contract sections 5.3 and 7.5): the learner is a nickname and a school grade,
 * never a guardian's e-mail or an account name; `Internal` messages exist only on this side; the API returns no user ids of
 * the parties. FE never works out a refund or a right - it shows the figures the server sends and the server's refusals.
 */
import type { PagedResult } from '../../../../core/http/paged-result.model';
import type {
  DisputeCategory,
  DisputeFlow,
  DisputeMessage,
  DisputeParty,
  DisputeResolution,
  DisputeStatus,
  EvidenceLink,
} from '../../data/tutoring-dispute.models';
import type { Guid, IsoUtc } from '../../data/tutoring-public.models';

export type { PagedResult };

export type DisputePriority = 'Normal' | 'High';
export type DisputeVisibility = 'Parties' | 'Internal';
export type EscrowFreezeResult = 'Frozen' | 'TooLate' | 'NotApplicable';
export type DisputeSort = 'sla' | 'newest' | 'oldest' | 'activity';
export type DisputeDecisionKind = 'Resolve' | 'Reject';
export type BookingStatusAtOpen = 'Completed' | 'NoShowLearner' | 'NoShowTutor' | 'NoShowBoth';

/** Fixed hint codes of the detail (`hints[]`); an unknown code must degrade to nothing, never to a raw string. */
export type DisputeHint =
  | 'minor_learner'
  | 'behavior_complaint'
  | 'repeat_complaint'
  | 'tutor_suspended'
  | 'learner_repeat_rejected'
  | 'appeal_penalty_exists';

export type TutorSuspensionOutcome = 'NotRequested' | 'Done' | 'SkippedNotVerified' | 'Failed';

/** `GET admin/disputes/summary`: the tiles above the queue. */
export interface AdminDisputeSummary {
  readonly open: number;
  readonly underReview: number;
  readonly overdue: number;
  readonly highPriority: number;
  readonly awaitingAdminReply: number;
  readonly needsFollowUp: number;
  readonly oldestOpenedAtUtc: IsoUtc | null;
  /** Total of the money currently frozen by open disputes. */
  readonly frozenAmountTotal: number;
  readonly serverTimeUtc: IsoUtc;
}

export interface AdminDisputeListItem {
  readonly disputeId: Guid;
  readonly disputeNo: string;
  readonly bookingNo: string;
  readonly status: DisputeStatus;
  readonly category: DisputeCategory;
  readonly flow: DisputeFlow;
  readonly priority: DisputePriority;
  readonly openedByRole: DisputeParty;
  readonly tutor: { readonly tutorId: Guid; readonly displayName: string; readonly slug: string };
  readonly learnerNickname: string;
  readonly learnerIsMinor: boolean;
  readonly amountAtStake: number;
  readonly openedAtUtc: IsoUtc;
  readonly lastActivityAtUtc: IsoUtc;
  /** Who wrote last; anything but `Admin` means the case is waiting for an administrator. */
  readonly lastMessageRole: DisputeParty | 'Admin' | null;
  readonly slaDueAtUtc: IsoUtc;
  readonly isOverdue: boolean;
  readonly ageHours: number;
  readonly agingAlertLevel: number;
  readonly repeatComplaintFlag: boolean;
  readonly assignedToUserId: Guid | null;
  readonly escrowFreeze: EscrowFreezeResult;
  readonly compensationRequired: boolean;
  readonly compensationSettled: boolean;
}

/** One line of the thread as an administrator sees it: with its visibility, which the learner and tutor versions lack. */
export interface AdminDisputeMessage extends Omit<DisputeMessage, 'isMine'> {
  readonly visibility: DisputeVisibility;
  readonly authorUserId: Guid | null;
}

export interface AdminDisputeAttendance {
  readonly tutorJoinedAtUtc: IsoUtc | null;
  readonly tutorConfirmedAtUtc: IsoUtc | null;
  readonly learnerJoinedAtUtc: IsoUtc | null;
  readonly tutorPresentAttestedAtUtc: IsoUtc | null;
  readonly learnerConfirmedAtUtc: IsoUtc | null;
  readonly decision: {
    readonly outcome: string;
    readonly decidedAtUtc: IsoUtc;
    readonly decidedBy: string;
    readonly tutorEvidence: string;
    readonly learnerEvidence: string;
  } | null;
  readonly joinLogs: readonly { readonly role: string; readonly joinedAtUtc: IsoUtc }[];
}

export interface AdminDisputePayment {
  readonly paymentId: Guid;
  readonly method: string;
  readonly status: string;
  readonly amount: number;
  readonly refundReservedAmount: number;
  readonly refundedCompletedAmount: number;
  readonly succeededAtUtc: IsoUtc | null;
}

export interface AdminDisputeRefund {
  readonly refundId: Guid;
  readonly amount: number;
  readonly reason: string;
  readonly status: string;
  readonly requestedAtUtc: IsoUtc;
  readonly completedAtUtc: IsoUtc | null;
}

export interface AdminDisputePenalty {
  readonly kind: string;
  readonly points: number;
  readonly reasonCode: string;
  readonly createdAtUtc: IsoUtc;
  readonly voided: boolean;
}

export interface AdminDisputeTutorHistory {
  readonly status: string;
  readonly reliabilityScore: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedSessionsCount: number;
  readonly penalties: readonly AdminDisputePenalty[];
  readonly disputes90d: { readonly total: number; readonly upheld: number; readonly noRefundOrRejected: number };
}

export interface AdminDisputeDecisionView {
  readonly resolution: DisputeResolution;
  readonly refundAmount: number | null;
  readonly refundId: Guid | null;
  readonly note: string;
  readonly decidedAtUtc: IsoUtc;
  readonly decidedByUserId: Guid;
  readonly attendanceOverturned: boolean;
  readonly penaltyVoided: boolean;
}

export interface AdminDisputeDetail extends AdminDisputeListItem {
  readonly bookingId: Guid;
  readonly sessionId: Guid;
  readonly description: string;
  readonly bookingStatusAtOpen: BookingStatusAtOpen;
  readonly session: {
    readonly startsAtUtc: IsoUtc;
    readonly endsAtUtc: IsoUtc;
    readonly subjectNameTh: string;
    readonly subjectNameEn: string;
    readonly format: string;
  };
  readonly learner: { readonly nickname: string; readonly gradeLevel: string; readonly isMinor: boolean };
  readonly attendance: AdminDisputeAttendance;
  readonly payment: AdminDisputePayment | null;
  readonly refunds: readonly AdminDisputeRefund[];
  readonly priceAmount: number;
  readonly refundedAmount: number;
  readonly isPackageBooking: boolean;
  readonly tutorHistory: AdminDisputeTutorHistory;
  readonly evidenceLinks: readonly EvidenceLink[];
  readonly messages: readonly AdminDisputeMessage[];
  readonly decision: AdminDisputeDecisionView | null;
  readonly hints: readonly DisputeHint[];
  readonly repeatComplaintCount: number;
  readonly tutorSuspension: TutorSuspensionOutcome;
  /** `true` when the same decision had already been recorded (a double submit or a second administrator). */
  readonly alreadyDecided: boolean;
  readonly serverTimeUtc: IsoUtc;
}

/** Query of `GET admin/disputes`. The list syntax of `status` is not spelled out by the contract: a comma-separated list, like KYC. */
export interface AdminDisputeQuery {
  readonly status?: readonly DisputeStatus[];
  readonly category?: DisputeCategory;
  readonly flow?: DisputeFlow;
  readonly priority?: DisputePriority;
  readonly overdue?: boolean;
  readonly assignedToMe?: boolean;
  readonly needsFollowUp?: boolean;
  readonly tutorId?: Guid;
  /** Exact dispute number or booking number. */
  readonly q?: string;
  readonly sort?: DisputeSort;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ClaimDisputeRequest {
  readonly takeOver: boolean;
}

export interface EvidenceLinkInput {
  readonly url: string;
  readonly label: string | null;
}

export interface AdminPostMessageRequest {
  /** A new id per message; a retry with the same id answers the message already stored. */
  readonly clientMessageId: Guid;
  readonly body: string;
  readonly visibility: DisputeVisibility;
  readonly evidenceLinks: readonly EvidenceLinkInput[] | null;
}

/**
 * `Escrow` flow + `Resolve`: `resolution` is required, and `refundAmount` only for `PartialRefund`. `Reject` and the
 * `AttendanceAppeal` flow send no `resolution` / `refundAmount` at all. `attendanceOverturned` / `compensationRequired` are for
 * an appeal that is resolved; `suspendReason` is required with `suspendTutor`.
 */
export interface DecideDisputeRequest {
  readonly decision: DisputeDecisionKind;
  readonly resolution: DisputeResolution | null;
  readonly refundAmount: number | null;
  readonly attendanceOverturned: boolean;
  readonly compensationRequired: boolean;
  /** 3-1000 characters; BOTH parties read it. */
  readonly note: string;
  readonly suspendTutor: boolean;
  readonly suspendReason: string | null;
}

export interface CompensationSettledRequest {
  readonly note: string;
}
