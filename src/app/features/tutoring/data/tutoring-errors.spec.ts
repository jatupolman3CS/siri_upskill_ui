import { ApiError } from '../../../core/http/error.interceptor';
import { TUTORING_EN as en, TUTORING_TH as th } from '../testing/tutoring-i18n';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonKey } from './tutoring-errors';

function problem(status: number, reason?: string, extra: object = {}): ApiError {
  return new ApiError(status, 'x', 'validation', { status, reason, ...extra });
}

function hasKey(dictionary: unknown, key: string): boolean {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary) !== undefined;
}

describe('tutoringErrorKey', () => {
  it.each([
    ['tutoring.search_invalid', 'tutoring.errors.searchInvalid'],
    ['tutoring.tutor_not_found', 'tutoring.errors.tutorNotFound'],
    ['tutoring.photo_not_found', 'tutoring.errors.photoNotFound'],
    ['tutoring.intro_video_not_found', 'tutoring.errors.introVideoNotFound'],
    ['tutoring.slots_range_invalid', 'tutoring.errors.slotsRangeInvalid'],
    ['tutoring.duration_not_allowed', 'tutoring.errors.durationNotAllowed'],
    ['tutoring.offering_not_found', 'tutoring.errors.offeringNotFound'],
    ['tutoring.offering_has_open_credits', 'tutoring.errors.offeringHasOpenCredits'],
    ['tutoring.trial_not_available', 'tutoring.errors.trialNotAvailable'],
    ['tutoring.format_not_offered', 'tutoring.errors.formatNotOffered'],
    ['tutoring.price_below_minimum', 'tutoring.errors.priceBelowMinimum'],
    ['tutoring.learner_profile_not_found', 'tutoring.errors.learnerProfileNotFound'],
    ['tutoring.booking_not_found', 'tutoring.errors.bookingNotFound'],
    ['tutoring.slot_not_on_grid', 'tutoring.errors.slotNotOnGrid'],
    ['tutoring.slot_too_soon', 'tutoring.errors.slotTooSoon'],
    ['tutoring.slot_too_far', 'tutoring.errors.slotTooFar'],
    ['tutoring.guardian_consent_required', 'tutoring.errors.guardianConsentRequired'],
    ['tutoring.learner_nickname_invalid', 'tutoring.errors.learnerNicknameInvalid'],
    ['tutoring.cannot_book_self', 'tutoring.errors.cannotBookSelf'],
    ['tutoring.trial_already_used', 'tutoring.errors.trialAlreadyUsed'],
    ['tutoring.slot_unavailable', 'tutoring.errors.slotUnavailable'],
    ['tutoring.slot_taken', 'tutoring.errors.slotTaken'],
    ['tutoring.slot_already_held_by_you', 'tutoring.errors.slotAlreadyHeldByYou'],
    ['tutoring.seats_full', 'tutoring.errors.seatsFull'],
    ['tutoring.already_booked_this_session', 'tutoring.errors.alreadyBookedThisSession'],
    ['tutoring.too_many_pending_holds', 'tutoring.errors.tooManyPendingHolds'],
    ['tutoring.learner_profile_limit', 'tutoring.errors.learnerProfileLimit'],
    ['tutoring.learner_profile_in_use', 'tutoring.errors.learnerProfileInUse'],
    ['tutoring.learner_profile_anonymised', 'tutoring.errors.learnerProfileAnonymised'],
    ['tutoring.booking_already_paid', 'tutoring.errors.bookingAlreadyPaid'],
    ['tutoring.booking_not_payable', 'tutoring.errors.bookingNotPayable'],
    ['tutoring.hold_expired', 'tutoring.errors.holdExpired'],
    ['tutoring.booking_is_free', 'tutoring.errors.bookingIsFree'],
    ['tutoring.payment_method_disabled', 'tutoring.errors.paymentMethodDisabled'],
    ['tutoring.too_many_payment_attempts', 'tutoring.errors.tooManyPaymentAttempts'],
    ['tutoring.payment_in_progress', 'tutoring.errors.paymentInProgress'],
    ['tutoring.payment_provider_unavailable', 'tutoring.errors.paymentProviderUnavailable'],
    ['tutoring.payment_not_found', 'tutoring.errors.paymentNotFound'],
    ['payment.provider_not_configured', 'tutoring.errors.paymentProviderNotConfigured'],
    ['tutoring.package_purchase_not_found', 'tutoring.errors.packagePurchaseNotFound'],
    ['tutoring.package_purchase_expired', 'tutoring.errors.packagePurchaseExpired'],
    ['tutoring.package_purchase_not_cancellable', 'tutoring.errors.packagePurchaseNotCancellable'],
    ['tutoring.too_many_pending_purchases', 'tutoring.errors.tooManyPendingPurchases'],
    ['tutoring.package_not_active', 'tutoring.errors.packageNotActive'],
    ['tutoring.package_expired', 'tutoring.errors.packageExpired'],
    ['tutoring.package_session_after_expiry', 'tutoring.errors.packageSessionAfterExpiry'],
    ['tutoring.package_no_credit', 'tutoring.errors.packageNoCredit'],
    ['tutoring.package_tutor_unavailable', 'tutoring.errors.packageTutorUnavailable'],
    ['tutoring.learner_profile_inactive', 'tutoring.errors.learnerProfileInactive'],
    ['tutoring.already_paid', 'tutoring.errors.alreadyPaid'],
    ['tutoring.cancel_after_join', 'tutoring.errors.cancelAfterJoin'],
    ['tutoring.too_many_active_trials', 'tutoring.errors.tooManyActiveTrials'],
    ['tutoring.admin_self_action', 'tutoring.errors.adminSelfAction'],
    ['tutoring.booking_not_completable', 'tutoring.errors.bookingNotCompletable'],
    ['tutoring.booking_not_disputed', 'tutoring.errors.bookingNotDisputed'],
    ['tutoring.escrow_already_released', 'tutoring.errors.escrowAlreadyReleased'],
    ['tutoring.invalid_kind', 'tutoring.errors.invalidKind'],
    ['tutoring.invalid_paging', 'tutoring.errors.invalidPaging'],
    ['tutoring.invalid_scope', 'tutoring.errors.invalidScope'],
    ['tutoring.noshow_conflict', 'tutoring.errors.noShowConflict'],
    ['tutoring.package_credit_not_found', 'tutoring.errors.packageCreditNotFound'],
    ['tutoring.refund_not_allowed', 'tutoring.errors.refundNotAllowed'],
    ['tutoring.refund_not_retryable', 'tutoring.errors.refundNotRetryable'],
    ['tutoring.refund_retry_unconfirmed', 'tutoring.errors.refundRetryUnconfirmed'],
    ['tutoring.analytics_busy', 'tutoring.errors.analyticsBusy'],
    ['tutoring.analytics_range_invalid', 'tutoring.errors.analyticsRangeInvalid'],
    ['tutoring.analytics_timeout', 'tutoring.errors.analyticsTimeout'],
  ])('maps %s to %s, and that key exists in both dictionaries', (reason, key) => {
    expect(tutoringErrorKey(problem(400, reason))).toBe(key);
    expect(hasKey(th, key)).toBe(true);
    expect(hasKey(en, key)).toBe(true);
  });

  it('recognises HTTP 429 by status alone (the body carries no reason)', () => {
    expect(tutoringErrorKey(new ApiError(429, 'x'))).toBe('tutoring.errors.rateLimited');
  });

  it('falls back to the generic message for an unknown reason, a missing body or a non-ApiError', () => {
    expect(tutoringErrorKey(problem(500, 'tutoring.something_new'))).toBe('tutoring.errors.generic');
    expect(tutoringErrorKey(new ApiError(500, 'x'))).toBe('tutoring.errors.generic');
    expect(tutoringErrorKey(new Error('boom'))).toBe('tutoring.errors.generic');
    expect(tutoringErrorKey(undefined)).toBe('tutoring.errors.generic');
  });
});

describe('tutoringProblemOf', () => {
  it('returns the booking that already holds a slot (slot_already_held_by_you extension)', () => {
    expect(tutoringProblemOf(problem(409, 'tutoring.slot_already_held_by_you', { bookingId: 'b-held' }))?.bookingId).toBe('b-held');
  });

  it('returns the current consent version of a guardian-consent refusal', () => {
    expect(tutoringProblemOf(problem(400, 'tutoring.guardian_consent_required', { currentVersion: '2026-11-v2' }))?.currentVersion).toBe('2026-11-v2');
  });

  it('returns the problem body, including the offending field of a search 400', () => {
    expect(tutoringProblemOf(problem(400, 'tutoring.search_invalid', { field: 'priceMin' }))?.field).toBe('priceMin');
  });

  it('returns null when there is no structured body', () => {
    expect(tutoringProblemOf(new ApiError(400, 'x'))).toBeNull();
    expect(tutoringProblemOf('nope')).toBeNull();
  });
});

describe('tutoringReasonKey (cancellation refusal codes)', () => {
  it.each([
    ['after_start', 'tutoring.errors.cancelAfterStart'],
    ['cancel_after_start', 'tutoring.errors.cancelAfterStart'],
    ['tutoring.cancel_after_start', 'tutoring.errors.cancelAfterStart'],
    ['after_end', 'tutoring.errors.cancelAfterEnd'],
    ['cancel_after_end', 'tutoring.errors.cancelAfterEnd'],
    ['tutoring.cancel_after_end', 'tutoring.errors.cancelAfterEnd'],
    ['after_join', 'tutoring.errors.cancelAfterJoin'],
    ['cancel_after_join', 'tutoring.errors.cancelAfterJoin'],
    ['tutoring.cancel_after_join', 'tutoring.errors.cancelAfterJoin'],
    ['booking_not_cancellable', 'tutoring.errors.bookingNotCancellable'],
    ['class_not_cancellable', 'tutoring.errors.classNotCancellable'],
  ])('maps the refusal code %s to %s, which exists in both dictionaries', (code, key) => {
    expect(tutoringReasonKey(code)).toBe(key);
    expect(hasKey(th, key)).toBe(true);
    expect(hasKey(en, key)).toBe(true);
  });

  it('answers the generic message for an unknown, empty or missing code', () => {
    expect(tutoringReasonKey('after_the_fact')).toBe('tutoring.errors.generic');
    expect(tutoringReasonKey('')).toBe('tutoring.errors.generic');
    expect(tutoringReasonKey(null)).toBe('tutoring.errors.generic');
    expect(tutoringReasonKey(undefined)).toBe('tutoring.errors.generic');
  });
});
