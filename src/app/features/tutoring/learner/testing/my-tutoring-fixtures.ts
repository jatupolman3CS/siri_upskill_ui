/**
 * Test fixtures of the "My tutoring" specs (P13-23): well-formed API payloads that individual tests override. Not used by the app.
 */
import type { MaterialDto } from '../../data/tutoring-classes.models';
import type { BookingDisputeState, DisputeDetail, DisputeMessage, EvidenceLink } from '../../data/tutoring-dispute.models';
import type { BookingListItem } from '../../data/tutoring-learner.models';
import type {
  BookingRefundSummary,
  BookingSummaryDto,
  CancelBookingResponse,
  CancellationQuote,
} from '../../data/tutoring-my-bookings.models';
import type { BookingReviewState, MyReview } from '../../data/tutoring-review.models';
import { booking } from './learner-fixtures';

export const SESSION_ID = '0198a000-0000-7000-8000-000000000001';

/** A confirmed lesson 20 Oct 2026 18:00-19:00 Bangkok, server clock 14 Oct 2026 03:00Z, join window not open yet. */
export function listItem(overrides: Partial<BookingListItem> = {}): BookingListItem {
  const full = booking({
    status: 'Confirmed',
    requiresPayment: false,
    holdExpiresAtUtc: null,
    confirmedAtUtc: '2026-10-14T03:05:00Z',
    joinOpensAtUtc: '2026-10-20T10:45:00Z',
    canJoin: false,
  });
  return {
    bookingId: full.bookingId,
    bookingNo: full.bookingNo,
    status: full.status,
    isTrial: full.isTrial,
    format: full.format,
    priceAmount: full.priceAmount,
    currency: full.currency,
    startsAtUtc: full.startsAtUtc,
    endsAtUtc: full.endsAtUtc,
    durationMinutes: full.durationMinutes,
    tutor: full.tutor,
    offering: full.offering,
    learner: full.learner,
    holdExpiresAtUtc: full.holdExpiresAtUtc,
    requiresPayment: full.requiresPayment,
    packagePurchaseId: full.packagePurchaseId,
    joinOpensAtUtc: full.joinOpensAtUtc,
    canJoin: full.canJoin,
    serverTimeUtc: '2026-10-14T03:00:00Z',
    sessionId: SESSION_ID,
    refundedAmount: full.refundedAmount,
    attendance: null,
    disputeId: null,
    disputeWindowEndsAtUtc: null,
    ...overrides,
  };
}

export function quote(overrides: Partial<CancellationQuote> = {}): CancellationQuote {
  return {
    bookingId: 'b-1',
    canCancel: true,
    refusalReason: null,
    ruleCode: 'learner_cancel.full',
    amountPaid: 450,
    refundAmount: 450,
    retainedAmount: 0,
    refundPercent: 100,
    settlement: 'Money',
    refundIsAsync: true,
    startsAtUtc: '2026-10-20T11:00:00Z',
    quotedAtUtc: '2026-10-14T03:00:00Z',
    hoursUntilStart: 152,
    ...overrides,
  };
}

export function cancelled(overrides: Partial<CancelBookingResponse> = {}): CancelBookingResponse {
  return {
    bookingId: 'b-1',
    status: 'CancelledByLearner',
    alreadyCancelled: false,
    refundAmount: 450,
    retainedAmount: 0,
    settlement: 'Money',
    refund: { refundId: 'r-1', amount: 450, status: 'Requested', isAsync: true, requestedAtUtc: '2026-10-14T03:01:00Z', completedAtUtc: null },
    creditRestored: false,
    ...overrides,
  };
}

export function refund(overrides: Partial<BookingRefundSummary> = {}): BookingRefundSummary {
  return { refundId: 'r-1', amount: 450, status: 'Processing', isAsync: true, requestedAtUtc: '2026-10-14T03:01:00Z', completedAtUtc: null, ...overrides };
}

export function summary(overrides: Partial<BookingSummaryDto> = {}): BookingSummaryDto {
  return {
    bookingId: 'b-1',
    sessionId: SESSION_ID,
    topicsCovered: 'Newton laws\nForces and motion',
    feedback: 'Mint did well.',
    homework: 'Exercise 4',
    nextSteps: 'Revise formulas',
    createdAtUtc: '2026-10-20T12:30:00Z',
    updatedAtUtc: null,
    ...overrides,
  };
}

export function material(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm-1',
    kind: 'Link',
    title: 'Practice sheet',
    url: 'https://docs.example.test/sheet',
    bodyText: null,
    fileName: null,
    contentType: null,
    sizeBytes: null,
    addedAtUtc: '2026-10-20T12:30:00Z',
    ...overrides,
  };
}

export function review(overrides: Partial<MyReview> = {}): MyReview {
  return { reviewId: 'rev-1', bookingId: 'b-1', rating: 4, comment: 'Clear explanations.', anonymous: false, status: 'Published', createdAtUtc: '2026-10-21T03:00:00Z', editedAtUtc: null, ...overrides };
}

export function reviewState(overrides: Partial<BookingReviewState> = {}): BookingReviewState {
  return { bookingId: 'b-1', canReview: true, reasonCode: null, reviewableUntilUtc: '2027-01-18T12:00:00Z', review: null, canEdit: false, editableUntilUtc: null, ...overrides };
}

export function disputeState(overrides: Partial<BookingDisputeState> = {}): BookingDisputeState {
  return {
    bookingId: 'b-1',
    canOpen: true,
    reasonCode: null,
    flow: 'Escrow',
    allowedCategories: ['NoClass', 'TutorConnection', 'Behavior', 'NotAsDescribed', 'Other'],
    windowEndsAtUtc: '2026-10-21T12:00:00Z',
    dispute: null,
    fundsWillBeHeld: true,
    serverTimeUtc: '2026-10-20T13:00:00Z',
    ...overrides,
  };
}

export function evidence(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return { evidenceId: 'ev-1', url: 'https://files.example.test/screenshot.png', host: 'files.example.test', label: 'Screenshot', addedByRole: 'Learner', addedAtUtc: '2026-10-20T13:05:00Z', ...overrides };
}

export function message(overrides: Partial<DisputeMessage> = {}): DisputeMessage {
  return { messageId: 'msg-1', kind: 'Message', authorRole: 'Learner', isMine: true, body: 'The tutor never joined.', evidenceLinks: [], createdAtUtc: '2026-10-20T13:05:00Z', ...overrides };
}

export function dispute(overrides: Partial<DisputeDetail> = {}): DisputeDetail {
  return {
    disputeId: 'd-1',
    disputeNo: 'DP-2610-AB12',
    bookingId: 'b-1',
    bookingNo: 'TB-261014-A1B2C3',
    status: 'Open',
    category: 'NoClass',
    flow: 'Escrow',
    myRole: 'Learner',
    openedByRole: 'Learner',
    description: 'The tutor never joined the room.',
    session: { startsAtUtc: '2026-10-20T11:00:00Z', endsAtUtc: '2026-10-20T12:00:00Z', subjectNameTh: 'Physics (TH)', subjectNameEn: 'Physics' },
    counterparty: { role: 'Tutor', displayName: 'Nina Tutor', gradeLevel: null },
    evidenceLinks: [],
    messages: [
      message({ messageId: 'sys-1', kind: 'System', authorRole: 'System', isMine: false, body: 'opened' }),
      message(),
    ],
    openedAtUtc: '2026-10-20T13:05:00Z',
    lastActivityAtUtc: '2026-10-20T13:05:00Z',
    expectedResolutionByUtc: '2026-10-23T13:05:00Z',
    fundsOnHold: true,
    decision: null,
    withdrawnAtUtc: null,
    canPostMessage: true,
    canWithdraw: true,
    withdrawBlockedReason: null,
    serverTimeUtc: '2026-10-20T14:00:00Z',
    ...overrides,
  };
}
