import { TUTORING_EN as en, TUTORING_TH as th } from '../testing/tutoring-i18n';
import { ApiError } from '../../../core/http/error.interceptor';
import type { DisputeCategory, DisputeFlow, DisputeResolution, DisputeStatus } from './tutoring-dispute.models';
import { DISPUTE_SYSTEM_MESSAGE_CODES, disputeCategoryLabelKey, disputeFlowLabelKey, disputeResolutionLabelKey, disputeStatusLabelKey, disputeSystemMessageKey } from './tutoring-labels';
import { tutoringErrorKey } from './tutoring-errors';
import type { BookingStatus } from './tutoring-learner.models';
import {
  bookingStatusView,
  disputeStatusView,
  joinCue,
  joinRoute,
  mayHaveRefund,
  newClientId,
  nextJoinOpensDelayMs,
} from './tutoring-my.util';

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

const STATUSES: readonly BookingStatus[] = [
  'PendingPayment',
  'Confirmed',
  'CancelledByLearner',
  'CancelledByTutor',
  'Completed',
  'NoShowLearner',
  'NoShowTutor',
  'NoShowBoth',
  'Disputed',
  'Expired',
];

describe('bookingStatusView', () => {
  it.each(STATUSES)('gives %s a label that exists in both dictionaries, an icon and a tone (never colour alone)', (status) => {
    const view = bookingStatusView(status);

    expect(typeof lookup(th, view.labelKey)).toBe('string');
    expect(typeof lookup(en, view.labelKey)).toBe('string');
    expect(view.icon).not.toBe('');
    expect(['neutral', 'info', 'success', 'warning', 'danger']).toContain(view.tone);
  });

  it('tells the states that need attention from the finished ones', () => {
    expect(bookingStatusView('PendingPayment').tone).toBe('warning');
    expect(bookingStatusView('Completed').tone).toBe('success');
    expect(bookingStatusView('NoShowTutor').tone).toBe('danger');
    expect(bookingStatusView('Expired').tone).toBe('neutral');
  });
});

describe('disputeStatusView', () => {
  it.each(['Open', 'UnderReview', 'Resolved', 'Rejected', 'Withdrawn'] as const)('labels %s in both languages', (status) => {
    expect(typeof lookup(th, disputeStatusView(status).labelKey)).toBe('string');
    expect(typeof lookup(en, disputeStatusView(status).labelKey)).toBe('string');
  });
});

describe('mayHaveRefund', () => {
  it.each(['CancelledByLearner', 'CancelledByTutor', 'NoShowTutor', 'NoShowBoth', 'Disputed'] as const)('looks for refunds of a paid %s booking', (status) => {
    expect(mayHaveRefund({ status, priceAmount: 450 })).toBe(true);
  });

  it('never looks for refunds of a free trial', () => {
    expect(mayHaveRefund({ status: 'CancelledByLearner', priceAmount: 0 })).toBe(false);
  });

  it('does not look for refunds of a live or normally finished booking - unless money was already refunded', () => {
    expect(mayHaveRefund({ status: 'Confirmed', priceAmount: 450 })).toBe(false);
    expect(mayHaveRefund({ status: 'Completed', priceAmount: 450 })).toBe(false);
    expect(mayHaveRefund({ status: 'Completed', priceAmount: 450 }, 100)).toBe(true);
  });
});

describe('joinRoute', () => {
  it('points at the join page of the class', () => {
    expect(joinRoute('abc')).toEqual(['/tutoring', 'sessions', 'abc', 'join']);
  });
});

describe('joinCue', () => {
  const NOW = Date.parse('2026-10-20T10:00:00Z');
  const base = { status: 'Confirmed' as const, canJoin: false, joinOpensAtUtc: '2026-10-20T10:45:00Z' };

  it('offers the join link when the server says the window is open', () => {
    expect(joinCue({ ...base, canJoin: true }, NOW)).toEqual({ kind: 'join' });
  });

  it('counts down to a window that opens later, on the clock it was given', () => {
    expect(joinCue(base, NOW)).toEqual({ kind: 'opens', opensAtUtc: '2026-10-20T10:45:00Z' });
  });

  it('shows nothing once the opening moment has passed without the server saying canJoin (the list asks the server again)', () => {
    expect(joinCue(base, Date.parse('2026-10-20T10:50:00Z'))).toEqual({ kind: 'none' });
  });

  it('shows nothing for a booking that is not confirmed, whatever its flags say', () => {
    expect(joinCue({ ...base, status: 'CancelledByLearner', canJoin: true }, NOW)).toEqual({ kind: 'none' });
    expect(joinCue({ ...base, status: 'PendingPayment' }, NOW)).toEqual({ kind: 'none' });
  });

  it('offers the join link as soon as the server says canJoin - every booking carries its session id, so there is no e-mail-only case', () => {
    expect(joinCue({ status: 'Confirmed', canJoin: true, joinOpensAtUtc: null }, NOW)).toEqual({ kind: 'join' });
  });
});

describe('nextJoinOpensDelayMs', () => {
  const NOW = Date.parse('2026-10-20T10:00:00Z');

  it('waits for the soonest join window to open, plus one second of slack', () => {
    const items = [
      { status: 'Confirmed' as const, joinOpensAtUtc: '2026-10-20T10:30:00Z' },
      { status: 'Confirmed' as const, joinOpensAtUtc: '2026-10-20T10:10:00Z' },
    ];

    expect(nextJoinOpensDelayMs(items, 0, NOW)).toBe(10 * 60_000 + 1_000);
  });

  it('measures on the server clock when the device clock is off', () => {
    const items = [{ status: 'Confirmed' as const, joinOpensAtUtc: '2026-10-20T10:10:00Z' }];

    // The device is 5 minutes slow: the server is 5 minutes ahead, so only 5 minutes remain.
    expect(nextJoinOpensDelayMs(items, 5 * 60_000, NOW)).toBe(5 * 60_000 + 1_000);
  });

  it('ignores windows that already opened, bookings that are not confirmed, and a booking without a window', () => {
    const items = [
      { status: 'Confirmed' as const, joinOpensAtUtc: '2026-10-20T09:00:00Z' },
      { status: 'PendingPayment' as const, joinOpensAtUtc: '2026-10-20T10:30:00Z' },
      { status: 'Confirmed' as const, joinOpensAtUtc: null },
    ];

    expect(nextJoinOpensDelayMs(items, 0, NOW)).toBeNull();
  });

  it('gives up on a window too far away for one timer', () => {
    expect(nextJoinOpensDelayMs([{ status: 'Confirmed', joinOpensAtUtc: '2027-10-20T10:00:00Z' }], 0, NOW)).toBeNull();
  });
});

describe('newClientId', () => {
  it('makes a v4-shaped id each time', () => {
    const first = newClientId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientId()).not.toBe(first);
  });

  it('falls back to getRandomValues when randomUUID is missing (an insecure context)', () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newClientId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('dictionary keys built at runtime by the My tutoring screens', () => {
  // i18n-guard.spec cannot see keys assembled from a variable - this is their guard.
  const dynamic = [
    ...['upcoming', 'history'].map((tab) => `tutoring.learner.my.tab.${tab}`),
    ...['Requested', 'Processing', 'Completed', 'Failed'].map((status) => `tutoring.learner.my.refund.status.${status}`),
    ...['booking_not_completed', 'refunded', 'window_closed', 'exists', 'disabled'].map((code) => `tutoring.review.reason.${code}`),
    ...['status_not_eligible', 'window_closed', 'already_open', 'already_decided', 'role_not_allowed', 'feature_disabled', 'limit_reached', 'reopen_not_allowed'].map(
      (code) => `tutoring.dispute.reason.${code}`,
    ),
    ...['not_opener', 'other_party_posted', 'behavior', 'admin_decided'].map((code) => `tutoring.dispute.withdraw.blocked.${code}`),
    ...['you', 'Learner', 'Tutor', 'Admin', 'System'].map((role) => `tutoring.dispute.thread.${role}`),
    ...(['NoClass', 'TutorConnection', 'Behavior', 'NotAsDescribed', 'Other'] as DisputeCategory[]).map(disputeCategoryLabelKey),
    ...(['Open', 'UnderReview', 'Resolved', 'Rejected', 'Withdrawn'] as DisputeStatus[]).map(disputeStatusLabelKey),
    ...(['Escrow', 'AttendanceAppeal'] as DisputeFlow[]).map(disputeFlowLabelKey),
    ...(['FullRefund', 'PartialRefund', 'NoRefund'] as DisputeResolution[]).map(disputeResolutionLabelKey),
    ...DISPUTE_SYSTEM_MESSAGE_CODES.map(disputeSystemMessageKey),
    disputeSystemMessageKey('a_code_from_the_future'),
  ];

  it.each(dynamic)('%s resolves to a non-empty string in Thai and English', (key) => {
    expect(typeof lookup(th, key)).toBe('string');
    expect(typeof lookup(en, key)).toBe('string');
    expect((lookup(en, key) as string).length).toBeGreaterThan(0);
  });

  it('reads an unknown system line as a generic update', () => {
    expect(disputeSystemMessageKey('a_code_from_the_future')).toBe('tutoring.enums.disputeSystemMessage.unknown');
  });
});

describe('error reasons of the My tutoring screens', () => {
  const reasons: readonly (readonly [string, string])[] = [
    ['tutoring.booking_not_cancellable', 'tutoring.errors.bookingNotCancellable'],
    ['tutoring.cancel_after_start', 'tutoring.errors.cancelAfterStart'],
    ['tutoring.cancellation_quote_changed', 'tutoring.errors.cancellationQuoteChanged'],
    ['tutoring.confirm_not_available', 'tutoring.errors.confirmNotAvailable'],
    ['tutoring.review_booking_not_completed', 'tutoring.errors.reviewBookingNotCompleted'],
    ['tutoring.review_booking_refunded', 'tutoring.errors.reviewBookingRefunded'],
    ['tutoring.review_window_closed', 'tutoring.errors.reviewWindowClosed'],
    ['tutoring.review_exists', 'tutoring.errors.reviewExists'],
    ['tutoring.review_edit_disabled', 'tutoring.errors.reviewEditDisabled'],
    ['tutoring.review_edit_window_closed', 'tutoring.errors.reviewEditWindowClosed'],
    ['tutoring.review_hidden_not_editable', 'tutoring.errors.reviewHiddenNotEditable'],
    ['tutoring.review_not_found', 'tutoring.errors.reviewNotFound'],
    ['tutoring.review_comment_contains_meeting_link', 'tutoring.errors.reviewCommentContainsMeetingLink'],
    ['tutoring.review_comment_contains_contact', 'tutoring.errors.reviewCommentContainsContact'],
    ['tutoring.review_comment_required', 'tutoring.errors.reviewCommentRequired'],
    ['tutoring.dispute_not_found', 'tutoring.errors.disputeNotFound'],
    ['tutoring.dispute_not_available', 'tutoring.errors.disputeNotAvailable'],
    ['tutoring.dispute_role_not_allowed', 'tutoring.errors.disputeRoleNotAllowed'],
    ['tutoring.dispute_category_invalid', 'tutoring.errors.disputeCategoryInvalid'],
    ['tutoring.dispute_window_closed', 'tutoring.errors.disputeWindowClosed'],
    ['tutoring.dispute_already_open', 'tutoring.errors.disputeAlreadyOpen'],
    ['tutoring.dispute_already_decided', 'tutoring.errors.disputeAlreadyDecided'],
    ['tutoring.dispute_reopen_not_allowed', 'tutoring.errors.disputeReopenNotAllowed'],
    ['tutoring.dispute_limit_reached', 'tutoring.errors.disputeLimitReached'],
    ['tutoring.dispute_closed', 'tutoring.errors.disputeClosed'],
    ['tutoring.dispute_message_limit', 'tutoring.errors.disputeMessageLimit'],
    ['tutoring.dispute_withdraw_not_allowed', 'tutoring.errors.disputeWithdrawNotAllowed'],
    ['tutoring.dispute_text_contains_contact', 'tutoring.errors.disputeTextContainsContact'],
    ['tutoring.dispute_evidence_link_invalid', 'tutoring.errors.disputeEvidenceLinkInvalid'],
    ['tutoring.dispute_too_many_links', 'tutoring.errors.disputeTooManyLinks'],
    ['tutoring.escrow_unavailable', 'tutoring.errors.escrowUnavailable'],
  ];

  it.each(reasons)('maps %s to %s, and that key exists in both dictionaries', (reason, key) => {
    const error = new ApiError(409, 'x', 'conflict', { status: 409, reason });

    expect(tutoringErrorKey(error)).toBe(key);
    expect(typeof lookup(th, key)).toBe('string');
    expect(typeof lookup(en, key)).toBe('string');
  });
});
