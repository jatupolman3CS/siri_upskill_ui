/**
 * Dispute DTOs of the learner side (P13-14 appendix, section 14). They mirror the contract field for field; if a C# record
 * disagrees with a type here, the C# record wins: report it, do not guess. Only the learner-facing records are here - the
 * administrator's (`AdminDispute*`) belong to P13-26.
 *
 * Whether a dispute may be opened (status, window, role), which categories are allowed, whether a message may be posted and
 * whether the opener may withdraw are all the server's answers (`BookingDisputeState`, `DisputeDetail.can*`). The learner never
 * sees an `Internal` administrator note: the API does not send one.
 */
import type { Guid, IsoUtc } from './tutoring-learner.models';

export type DisputeParty = 'Learner' | 'Tutor';
export type DisputeCategory = 'NoClass' | 'TutorConnection' | 'Behavior' | 'NotAsDescribed' | 'Other';
export type DisputeStatus = 'Open' | 'UnderReview' | 'Resolved' | 'Rejected' | 'Withdrawn';
export type DisputeFlow = 'Escrow' | 'AttendanceAppeal';
export type DisputeResolution = 'FullRefund' | 'PartialRefund' | 'NoRefund';

/** Evidence is a link only (https) - the server never fetches it and never stores a file. */
export interface EvidenceLinkInput {
  readonly url: string;
  readonly label: string | null;
}

export interface EvidenceLink {
  readonly evidenceId: Guid;
  readonly url: string;
  /** The host of `url`, shown before the link is followed. */
  readonly host: string;
  readonly label: string | null;
  readonly addedByRole: DisputeParty | 'Admin';
  readonly addedAtUtc: IsoUtc;
}

/** `clientRequestId` makes opening idempotent: a retry with the same id answers the same dispute. */
export interface OpenDisputeRequest {
  readonly category: DisputeCategory;
  readonly description: string;
  readonly evidenceLinks: readonly EvidenceLinkInput[] | null;
  readonly clientRequestId: Guid;
}

export interface PostDisputeMessageRequest {
  readonly clientMessageId: Guid;
  readonly body: string;
  readonly evidenceLinks: readonly EvidenceLinkInput[] | null;
}

export type DisputeReasonCode =
  | 'status_not_eligible'
  | 'window_closed'
  | 'already_open'
  | 'already_decided'
  | 'role_not_allowed'
  | 'feature_disabled'
  | 'limit_reached'
  | 'reopen_not_allowed';

/** `GET bookings/{id}/dispute`: may a dispute be opened for this booking, and how. */
export interface BookingDisputeState {
  readonly bookingId: Guid;
  readonly canOpen: boolean;
  readonly reasonCode: DisputeReasonCode | null;
  readonly flow: DisputeFlow | null;
  readonly allowedCategories: readonly DisputeCategory[];
  readonly windowEndsAtUtc: IsoUtc | null;
  readonly dispute: { readonly disputeId: Guid; readonly disputeNo: string; readonly status: DisputeStatus } | null;
  /** Opening a dispute freezes the money of this class until it is decided. */
  readonly fundsWillBeHeld: boolean;
  readonly serverTimeUtc: IsoUtc;
}

/** `kind = 'System'`: `body` is a short code (`opened|claimed|decided|withdrawn|escrow_too_late`) translated by the client. */
export interface DisputeMessage {
  readonly messageId: Guid;
  readonly kind: 'Message' | 'System';
  readonly authorRole: DisputeParty | 'Admin' | 'System';
  readonly isMine: boolean;
  readonly body: string;
  readonly evidenceLinks: readonly EvidenceLink[];
  readonly createdAtUtc: IsoUtc;
}

export interface DisputeDecisionView {
  readonly resolution: DisputeResolution;
  readonly refundAmount: number | null;
  readonly note: string;
  readonly decidedAtUtc: IsoUtc;
  readonly attendanceOverturned: boolean;
}

export type WithdrawBlockedReason = 'not_opener' | 'other_party_posted' | 'behavior' | 'admin_decided';

/** `GET disputes/{id}` and the answer of open / withdraw. */
export interface DisputeDetail {
  readonly disputeId: Guid;
  readonly disputeNo: string;
  readonly bookingId: Guid;
  readonly bookingNo: string;
  readonly status: DisputeStatus;
  readonly category: DisputeCategory;
  readonly flow: DisputeFlow;
  readonly myRole: DisputeParty;
  readonly openedByRole: DisputeParty;
  readonly description: string;
  readonly session: {
    readonly startsAtUtc: IsoUtc;
    readonly endsAtUtc: IsoUtc;
    readonly subjectNameTh: string;
    readonly subjectNameEn: string;
  };
  /** For a learner this is the tutor's display name. */
  readonly counterparty: { readonly role: DisputeParty; readonly displayName: string; readonly gradeLevel: string | null };
  readonly evidenceLinks: readonly EvidenceLink[];
  readonly messages: readonly DisputeMessage[];
  readonly openedAtUtc: IsoUtc;
  readonly lastActivityAtUtc: IsoUtc;
  readonly expectedResolutionByUtc: IsoUtc;
  readonly fundsOnHold: boolean;
  readonly decision: DisputeDecisionView | null;
  readonly withdrawnAtUtc: IsoUtc | null;
  readonly canPostMessage: boolean;
  readonly canWithdraw: boolean;
  readonly withdrawBlockedReason: WithdrawBlockedReason | null;
  readonly serverTimeUtc: IsoUtc;
}

export interface DisputeListItem {
  readonly disputeId: Guid;
  readonly disputeNo: string;
  readonly bookingNo: string;
  readonly status: DisputeStatus;
  readonly category: DisputeCategory;
  readonly flow: DisputeFlow;
  readonly myRole: DisputeParty;
  readonly startsAtUtc: IsoUtc;
  readonly subjectNameTh: string;
  readonly subjectNameEn: string;
  readonly openedAtUtc: IsoUtc;
  readonly lastActivityAtUtc: IsoUtc;
}

export interface TutorDisputesQuery {
  readonly status?: DisputeStatus | string | null;
  readonly page?: number;
  readonly pageSize?: number;
}
