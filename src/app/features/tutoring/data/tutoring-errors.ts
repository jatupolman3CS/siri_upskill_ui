import { ApiError } from '../../../core/http/error.interceptor';

/**
 * Stable `reason` -> `tutoring.errors.*` i18n key, one entry per `reason` listed in the P13-03 / P13-04 contracts for the
 * public endpoints. Every public Tutoring screen resolves server failures through this one map so a given failure reads
 * the same everywhere (search, profile, slot picker, and later the booking flow).
 */
const REASON_KEYS: Readonly<Record<string, string>> = {
  'tutoring.search_invalid': 'tutoring.errors.searchInvalid',
  'tutoring.tutor_not_found': 'tutoring.errors.tutorNotFound',
  'tutoring.photo_not_found': 'tutoring.errors.photoNotFound',
  'tutoring.intro_video_not_found': 'tutoring.errors.introVideoNotFound',
  'tutoring.slots_range_invalid': 'tutoring.errors.slotsRangeInvalid',
  'tutoring.duration_not_allowed': 'tutoring.errors.durationNotAllowed',
  'tutoring.offering_not_found': 'tutoring.errors.offeringNotFound',
  'tutoring.trial_not_available': 'tutoring.errors.trialNotAvailable',
  'tutoring.format_not_offered': 'tutoring.errors.formatNotOffered',
  'tutoring.price_below_minimum': 'tutoring.errors.priceBelowMinimum',
  // Tutor Portal (P13-01).
  'tutoring.instructor_not_approved': 'tutoring.errors.instructorNotApproved',
  'tutoring.tutor_profile_not_found': 'tutoring.errors.tutorProfileNotFound',
  'tutoring.tutor_profile_exists': 'tutoring.errors.tutorProfileExists',
  'tutoring.slug_conflict': 'tutoring.errors.slugConflict',
  'tutoring.tutor_suspended': 'tutoring.errors.tutorSuspended',
  'tutoring.tutor_not_verified': 'tutoring.errors.tutorNotVerified',
  'tutoring.no_active_offering': 'tutoring.errors.noActiveOffering',
  'tutoring.concurrent_update': 'tutoring.errors.concurrentUpdate',
  'tutoring.admin_self_action': 'tutoring.errors.adminSelfAction',
  'tutoring.not_found': 'tutoring.errors.notFound',
  'tutoring.offering_duplicate': 'tutoring.errors.offeringDuplicate',
  'tutoring.offering_limit': 'tutoring.errors.offeringLimit',
  'tutoring.offering_has_open_credits': 'tutoring.errors.offeringHasOpenCredits',
  'tutoring.subject_not_found': 'tutoring.errors.subjectNotFound',
  'tutoring.education_limit': 'tutoring.errors.educationLimit',
  'tutoring.certificate_limit': 'tutoring.errors.certificateLimit',
  'tutoring.media_asset_not_found': 'tutoring.errors.mediaAssetNotFound',
  'tutoring.intro_video_not_ready': 'tutoring.errors.introVideoNotReady',
  'tutoring.intro_video_duration_invalid': 'tutoring.errors.introVideoDurationInvalid',
  'tutoring.image_invalid': 'tutoring.errors.imageInvalid',
  'tutoring.text_contains_markup': 'tutoring.errors.textContainsMarkup',
  'storage.provider_not_configured': 'tutoring.errors.storageUnavailable',
  // Identity verification (P13-02), tutor-facing reasons only; the administrator ones belong to P13-26.
  'tutoring.kyc.disabled': 'tutoring.errors.kyc.disabled',
  'tutoring.kyc.consent_outdated': 'tutoring.errors.kyc.consentOutdated',
  'tutoring.kyc.case_open': 'tutoring.errors.kyc.caseOpen',
  'tutoring.kyc.not_required': 'tutoring.errors.kyc.notRequired',
  'tutoring.kyc.attempts_exceeded': 'tutoring.errors.kyc.attemptsExceeded',
  'tutoring.kyc.file_rejected': 'tutoring.errors.kyc.fileRejected',
  'tutoring.kyc.expiry_invalid': 'tutoring.errors.kyc.expiryInvalid',
  'tutoring.kyc.case_not_editable': 'tutoring.errors.kyc.caseNotEditable',
  'tutoring.kyc.document_limit': 'tutoring.errors.kyc.documentLimit',
  'tutoring.kyc.document_locked': 'tutoring.errors.kyc.documentLocked',
  'tutoring.kyc.documents_missing': 'tutoring.errors.kyc.documentsMissing',
  'tutoring.kyc.profile_incomplete': 'tutoring.errors.kyc.profileIncomplete',
  // Learner profiles, booking and payment (P13-05 / P13-06).
  'tutoring.learner_profile_not_found': 'tutoring.errors.learnerProfileNotFound',
  'tutoring.booking_not_found': 'tutoring.errors.bookingNotFound',
  'tutoring.slot_not_on_grid': 'tutoring.errors.slotNotOnGrid',
  'tutoring.slot_too_soon': 'tutoring.errors.slotTooSoon',
  'tutoring.slot_too_far': 'tutoring.errors.slotTooFar',
  'tutoring.guardian_consent_required': 'tutoring.errors.guardianConsentRequired',
  'tutoring.learner_nickname_invalid': 'tutoring.errors.learnerNicknameInvalid',
  'tutoring.cannot_book_self': 'tutoring.errors.cannotBookSelf',
  'tutoring.trial_already_used': 'tutoring.errors.trialAlreadyUsed',
  'tutoring.too_many_active_trials': 'tutoring.errors.tooManyActiveTrials',
  'tutoring.slot_unavailable': 'tutoring.errors.slotUnavailable',
  'tutoring.slot_taken': 'tutoring.errors.slotTaken',
  'tutoring.slot_already_held_by_you': 'tutoring.errors.slotAlreadyHeldByYou',
  'tutoring.seats_full': 'tutoring.errors.seatsFull',
  'tutoring.already_booked_this_session': 'tutoring.errors.alreadyBookedThisSession',
  'tutoring.too_many_pending_holds': 'tutoring.errors.tooManyPendingHolds',
  'tutoring.learner_profile_limit': 'tutoring.errors.learnerProfileLimit',
  'tutoring.learner_profile_in_use': 'tutoring.errors.learnerProfileInUse',
  'tutoring.learner_profile_anonymised': 'tutoring.errors.learnerProfileAnonymised',
  'tutoring.consent_not_applicable': 'tutoring.errors.consentNotApplicable',
  'tutoring.consent_withdraw_blocked': 'tutoring.errors.consentWithdrawBlocked',
  'tutoring.erasure_blocked': 'tutoring.errors.erasureBlocked',
  'tutoring.booking_already_paid': 'tutoring.errors.bookingAlreadyPaid',
  'tutoring.booking_not_payable': 'tutoring.errors.bookingNotPayable',
  'tutoring.hold_expired': 'tutoring.errors.holdExpired',
  'tutoring.booking_is_free': 'tutoring.errors.bookingIsFree',
  'tutoring.payment_method_disabled': 'tutoring.errors.paymentMethodDisabled',
  'tutoring.too_many_payment_attempts': 'tutoring.errors.tooManyPaymentAttempts',
  'tutoring.payment_in_progress': 'tutoring.errors.paymentInProgress',
  'tutoring.payment_provider_unavailable': 'tutoring.errors.paymentProviderUnavailable',
  'payment.provider_not_configured': 'tutoring.errors.paymentProviderNotConfigured',
  'tutoring.payment_not_found': 'tutoring.errors.paymentNotFound',
  // Tutor availability (P13-03). The page refines the rule / exception ones with the `violation` extension.
  'tutoring.availability_rule_invalid': 'tutoring.errors.availabilityRuleInvalid',
  'tutoring.availability_exception_invalid': 'tutoring.errors.availabilityExceptionInvalid',
  'tutoring.availability_exception_conflict': 'tutoring.errors.availabilityExceptionConflict',
  'tutoring.availability_exception_limit': 'tutoring.errors.availabilityExceptionLimit',
  // Running a class: join / start, complete, summary, materials, room (P13-10).
  'tutoring.session_cancelled': 'tutoring.errors.sessionCancelled',
  'tutoring.session_closed': 'tutoring.errors.sessionClosed',
  'tutoring.session_ended': 'tutoring.errors.sessionEnded',
  'tutoring.window_not_open': 'tutoring.errors.windowNotOpen',
  'tutoring.room_not_ready': 'tutoring.errors.roomNotReady',
  'tutoring.complete_too_early': 'tutoring.errors.completeTooEarly',
  'tutoring.complete_no_learner_present': 'tutoring.errors.completeNoLearnerPresent',
  'tutoring.summary_locked': 'tutoring.errors.summaryLocked',
  'tutoring.summary_no_learners': 'tutoring.errors.summaryNoLearners',
  'tutoring.summary_invalid': 'tutoring.errors.summaryInvalid',
  'tutoring.material_limit_reached': 'tutoring.errors.materialLimitReached',
  'tutoring.material_link_not_allowed': 'tutoring.errors.materialLinkNotAllowed',
  'tutoring.material_invalid': 'tutoring.errors.materialInvalid',
  'tutoring.material_file_invalid': 'tutoring.errors.materialFileInvalid',
  'tutoring.materials_files_disabled': 'tutoring.errors.materialsFilesDisabled',
  'tutoring.virus_scanner_not_configured': 'tutoring.errors.virusScannerNotConfigured',
  'tutoring.storage_not_configured': 'tutoring.errors.storageNotConfigured',
  'live.meeting_link_invalid': 'tutoring.errors.meetingLinkInvalid',
  'live.meeting_link_host_not_allowed': 'tutoring.errors.meetingLinkHostNotAllowed',
  'live.room_not_editable': 'tutoring.errors.roomNotEditable',
  'live.meeting_not_resyncable': 'tutoring.errors.meetingNotResyncable',
  // Tutor cancellation of a class (P13-08).
  'tutoring.class_not_found': 'tutoring.errors.classNotFound',
  'tutoring.class_not_cancellable': 'tutoring.errors.classNotCancellable',
  'tutoring.cancel_after_end': 'tutoring.errors.cancelAfterEnd',
  // Learner cancellation and early confirmation (P13-08 / P13-10).
  'tutoring.booking_not_cancellable': 'tutoring.errors.bookingNotCancellable',
  'tutoring.cancel_after_start': 'tutoring.errors.cancelAfterStart',
  'tutoring.cancel_after_join': 'tutoring.errors.cancelAfterJoin',
  'tutoring.cancellation_quote_changed': 'tutoring.errors.cancellationQuoteChanged',
  // The `refusalReason` of a cancellation quote is a bare code, not an error reason (P13-08 section 5): the learner's quote says `after_start`, the
  // tutor's says `after_end`, and a booking / class that is no longer open says `booking_not_cancellable` / `class_not_cancellable`. `tutoringReasonKey`
  // finds the bare spellings here; the `cancel_after_*` spellings above are the reasons of the cancel call itself, and answer the same words.
  'tutoring.after_start': 'tutoring.errors.cancelAfterStart',
  'tutoring.after_end': 'tutoring.errors.cancelAfterEnd',
  'tutoring.after_join': 'tutoring.errors.cancelAfterJoin',
  'tutoring.confirm_not_available': 'tutoring.errors.confirmNotAvailable',
  // Reviews (P13-13).
  'tutoring.review_booking_not_completed': 'tutoring.errors.reviewBookingNotCompleted',
  'tutoring.review_booking_refunded': 'tutoring.errors.reviewBookingRefunded',
  'tutoring.review_window_closed': 'tutoring.errors.reviewWindowClosed',
  'tutoring.review_exists': 'tutoring.errors.reviewExists',
  'tutoring.review_edit_disabled': 'tutoring.errors.reviewEditDisabled',
  'tutoring.review_edit_window_closed': 'tutoring.errors.reviewEditWindowClosed',
  'tutoring.review_hidden_not_editable': 'tutoring.errors.reviewHiddenNotEditable',
  'tutoring.review_not_found': 'tutoring.errors.reviewNotFound',
  'tutoring.review_comment_contains_meeting_link': 'tutoring.errors.reviewCommentContainsMeetingLink',
  'tutoring.review_comment_contains_contact': 'tutoring.errors.reviewCommentContainsContact',
  'tutoring.review_comment_required': 'tutoring.errors.reviewCommentRequired',
  // Disputes (P13-14), the ones a learner can meet.
  'tutoring.dispute_not_found': 'tutoring.errors.disputeNotFound',
  'tutoring.dispute_not_available': 'tutoring.errors.disputeNotAvailable',
  'tutoring.dispute_role_not_allowed': 'tutoring.errors.disputeRoleNotAllowed',
  'tutoring.dispute_category_invalid': 'tutoring.errors.disputeCategoryInvalid',
  'tutoring.dispute_window_closed': 'tutoring.errors.disputeWindowClosed',
  'tutoring.dispute_already_open': 'tutoring.errors.disputeAlreadyOpen',
  'tutoring.dispute_already_decided': 'tutoring.errors.disputeAlreadyDecided',
  'tutoring.dispute_reopen_not_allowed': 'tutoring.errors.disputeReopenNotAllowed',
  'tutoring.dispute_limit_reached': 'tutoring.errors.disputeLimitReached',
  'tutoring.dispute_closed': 'tutoring.errors.disputeClosed',
  'tutoring.dispute_message_limit': 'tutoring.errors.disputeMessageLimit',
  'tutoring.dispute_withdraw_not_allowed': 'tutoring.errors.disputeWithdrawNotAllowed',
  'tutoring.dispute_text_contains_contact': 'tutoring.errors.disputeTextContainsContact',
  'tutoring.dispute_text_invalid': 'tutoring.errors.disputeTextInvalid',
  'tutoring.dispute_evidence_link_invalid': 'tutoring.errors.disputeEvidenceLinkInvalid',
  'tutoring.dispute_too_many_links': 'tutoring.errors.disputeTooManyLinks',
  'tutoring.escrow_unavailable': 'tutoring.errors.escrowUnavailable',
  // Packages (P13-12).
  'tutoring.package_not_found': 'tutoring.errors.packageNotFound',
  'tutoring.package_duplicate_shape': 'tutoring.errors.packageDuplicateShape',
  'tutoring.package_limit': 'tutoring.errors.packageLimit',
  'tutoring.package_price_below_minimum': 'tutoring.errors.packagePriceBelowMinimum',
  'tutoring.package_nothing_to_refund': 'tutoring.errors.packageNothingToRefund',
  'tutoring.package_not_expired': 'tutoring.errors.packageNotExpired',
  'tutoring.package_immutable_field': 'tutoring.errors.packageImmutableField',
  'tutoring.package_offering_inactive': 'tutoring.errors.packageOfferingInactive',
  // Buying and spending a package (P13-12 sections 5.1 and 7), the ones a learner can meet.
  'tutoring.package_purchase_not_found': 'tutoring.errors.packagePurchaseNotFound',
  'tutoring.package_purchase_expired': 'tutoring.errors.packagePurchaseExpired',
  'tutoring.package_purchase_not_cancellable': 'tutoring.errors.packagePurchaseNotCancellable',
  'tutoring.too_many_pending_purchases': 'tutoring.errors.tooManyPendingPurchases',
  'tutoring.package_not_active': 'tutoring.errors.packageNotActive',
  'tutoring.package_expired': 'tutoring.errors.packageExpired',
  'tutoring.package_session_after_expiry': 'tutoring.errors.packageSessionAfterExpiry',
  'tutoring.package_no_credit': 'tutoring.errors.packageNoCredit',
  'tutoring.package_tutor_unavailable': 'tutoring.errors.packageTutorUnavailable',
  'tutoring.learner_profile_inactive': 'tutoring.errors.learnerProfileInactive',
  'tutoring.already_paid': 'tutoring.errors.alreadyPaid',
  // Settlement, disputes & refunds (P13-08 / P13-10 / P13-14).
  'tutoring.booking_not_completable': 'tutoring.errors.bookingNotCompletable',
  'tutoring.booking_not_disputed': 'tutoring.errors.bookingNotDisputed',
  'tutoring.escrow_already_released': 'tutoring.errors.escrowAlreadyReleased',
  'tutoring.invalid_kind': 'tutoring.errors.invalidKind',
  'tutoring.invalid_paging': 'tutoring.errors.invalidPaging',
  'tutoring.invalid_scope': 'tutoring.errors.invalidScope',
  'tutoring.noshow_conflict': 'tutoring.errors.noShowConflict',
  'tutoring.package_credit_not_found': 'tutoring.errors.packageCreditNotFound',
  'tutoring.refund_not_allowed': 'tutoring.errors.refundNotAllowed',
  'tutoring.refund_not_retryable': 'tutoring.errors.refundNotRetryable',
  'tutoring.refund_retry_unconfirmed': 'tutoring.errors.refundRetryUnconfirmed',
  // Analytics (P13-15).
  'tutoring.analytics_busy': 'tutoring.errors.analyticsBusy',
  'tutoring.analytics_range_invalid': 'tutoring.errors.analyticsRangeInvalid',
  'tutoring.analytics_timeout': 'tutoring.errors.analyticsTimeout',
};

const RATE_LIMITED_KEY = 'tutoring.errors.rateLimited';
/** The request body exceeded the server's size limit before any application code ran (no `reason` in that response). */
const PAYLOAD_TOO_LARGE_KEY = 'tutoring.errors.fileTooLarge';
const GENERIC_KEY = 'tutoring.errors.generic';

/** RFC 9457 body of a Tutoring error as carried in `ApiError.details`. */
export interface TutoringProblem {
  readonly status?: number;
  readonly title?: string;
  readonly traceId?: string;
  readonly errorCode?: string;
  readonly reason?: string;
  /**
   * The standard RFC 9457 `detail` member. `tutoring.kyc.file_rejected` carries the category of the refusal here (`size` | `type` | `signature` |
   * `active_content`; see `kycFileRejectionOf` in the secure file uploader) - the controller promotes it from the error's extension into `detail`,
   * because an extension can not use that name. Every other problem leaves it to the server's own wording, which is never shown.
   */
  readonly detail?: string;
  /** `tutoring.search_invalid` names the offending query field. */
  readonly field?: string;
  /** `tutoring.offering_duplicate`: the existing (paused) twin that can be re-opened instead. */
  readonly offeringId?: string;
  /** `tutoring.kyc.consent_outdated` / `tutoring.guardian_consent_required`: the consent version that is current now. */
  readonly currentVersion?: string;
  /** `tutoring.kyc.case_open`: the case that is still open. */
  readonly caseId?: string;
  /** `tutoring.slot_already_held_by_you`: the booking that already holds the slot. */
  readonly bookingId?: string;
  /** `tutoring.kyc.documents_missing`: the required `KycDocumentType`s still absent. */
  readonly missingTypes?: readonly string[];
  /** `tutoring.kyc.profile_incomplete`: readiness blocker codes. */
  readonly blockers?: readonly string[];
  /**
   * `tutoring.availability_rule_invalid`: which rule of the request is wrong (`index`, 0-based) and why (`violation`); and
   * `tutoring.availability_exception_invalid`: `violation` alone. The contract calls the second key `detail`, but `detail` is a
   * ProblemDetails member the server keeps for itself, so the C# code sends `violation` (the C# record wins).
   */
  readonly index?: number;
  readonly violation?: string;
  /** `tutoring.window_not_open` / `tutoring.complete_too_early`: when the action opens (UTC), and the server clock to offset the browser's by. */
  readonly opensAtUtc?: string;
  readonly serverTimeUtc?: string;
  /** `tutoring.room_not_ready`: what the person can do about the room. */
  readonly needsAction?: string;
  /**
   * `tutoring.cancellation_quote_changed`: the refund / retained amounts that now apply (the real refund fell below the one the
   * learner confirmed), so the dialog can show them for a second confirmation.
   */
  readonly refundAmount?: number;
  readonly retainedAmount?: number;
  /** `tutoring.review_exists`: the review that is already there. `tutoring.review_window_closed`: when the window closed. */
  readonly reviewId?: string;
  readonly reviewableUntilUtc?: string;
  /** `tutoring.dispute_already_open | dispute_already_decided`: the case that exists. `dispute_window_closed`: when the window closed. */
  readonly disputeId?: string;
  readonly windowEndedAtUtc?: string;
  /** `tutoring.package_session_after_expiry`: when the package's credits stop being usable (UTC). */
  readonly expiresAtUtc?: string;
}

/** The structured problem body of a caught error, or `null` when it is not an `ApiError` with a body. */
export function tutoringProblemOf(error: unknown): TutoringProblem | null {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || error.details === null) {
    return null;
  }
  return error.details as TutoringProblem;
}

/**
 * Picks the i18n key that explains a failed public Tutoring call. Unknown reasons and non-`ApiError` failures fall back to
 * the generic message rather than echoing server text (the server `title` is never shown verbatim). HTTP 429 carries no
 * `reason` and is recognised by its status alone.
 */
export function tutoringErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return GENERIC_KEY;
  }
  if (error.status === 429) {
    return RATE_LIMITED_KEY;
  }
  if (error.status === 413) {
    return PAYLOAD_TOO_LARGE_KEY;
  }
  const reason = tutoringProblemOf(error)?.reason;
  return (reason !== undefined ? REASON_KEYS[reason] : undefined) ?? GENERIC_KEY;
}

/** The stable `reason` of a failed Tutoring call, or `undefined` when the failure carried none (network, 429, 5xx without a body). */
export function tutoringReasonOf(error: unknown): string | undefined {
  return tutoringProblemOf(error)?.reason;
}

/**
 * The i18n key for a bare reason code a response carries as DATA rather than as an error (e.g. the `refusalReason` of a
 * cancellation quote: `class_not_cancellable`, `cancel_after_end`). The code may or may not carry the `tutoring.` prefix.
 * Unknown codes fall back to the generic message.
 */
export function tutoringReasonKey(code: string | null | undefined): string {
  if (code === null || code === undefined || code === '') {
    return GENERIC_KEY;
  }
  return REASON_KEYS[code] ?? REASON_KEYS[`tutoring.${code}`] ?? GENERIC_KEY;
}
