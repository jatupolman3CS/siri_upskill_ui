import { ApiError } from '../../../../core/http/error.interceptor';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../data/tutoring-errors';

/**
 * Stable `reason` -> `tutoring.admin.errors.*` for the reasons only an administrator meets (P13-02 section 6.2, P13-01 section
 * 6.2, P13-14 section 5.3 / 14). Everything else - the reasons shared with the tutor and learner screens (`not_found`,
 * `concurrent_update`, `kyc.disabled`, `dispute_not_found`, ...) - resolves through the shared map in `tutoring-errors.ts`,
 * so a failure reads the same on every screen. The server's `title` is never shown.
 */
const ADMIN_REASON_KEYS: Readonly<Record<string, string>> = {
  'tutoring.kyc.case_already_decided': 'tutoring.admin.errors.caseAlreadyDecided',
  'tutoring.kyc.case_not_decidable': 'tutoring.admin.errors.caseNotDecidable',
  'tutoring.kyc.profile_state_conflict': 'tutoring.admin.errors.profileStateConflict',
  'tutoring.kyc.documents_undecided': 'tutoring.admin.errors.documentsUndecided',
  'tutoring.kyc.note_required': 'tutoring.admin.errors.noteRequired',
  'tutoring.kyc.document_purged': 'tutoring.admin.errors.documentPurged',
  'tutoring.kyc.log_unavailable': 'tutoring.admin.errors.logUnavailable',
  'tutoring.kyc.document_unreadable': 'tutoring.admin.errors.documentUnreadable',
  'tutoring.kyc.document_locked': 'tutoring.admin.errors.documentLocked',
  'tutoring.invalid_transition': 'tutoring.admin.errors.invalidTransition',
  'tutoring.subject_slug_exists': 'tutoring.admin.errors.subjectSlugExists',
  'tutoring.subject_parent_invalid': 'tutoring.admin.errors.subjectParentInvalid',
  'tutoring.dispute_not_decidable': 'tutoring.admin.errors.disputeNotDecidable',
  'tutoring.dispute_no_refundable_amount': 'tutoring.admin.errors.noRefundableAmount',
  'tutoring.dispute_appeal_no_refund': 'tutoring.admin.errors.appealNoRefund',
  'tutoring.dispute_decision_invalid': 'tutoring.admin.errors.decisionInvalid',
  'tutoring.dispute_claimed_by_other': 'tutoring.admin.errors.claimedByOther',
  'tutoring.dispute_no_compensation_required': 'tutoring.admin.errors.noCompensationRequired',
  'tutoring.refund_exceeds_cap': 'tutoring.admin.errors.refundExceedsCap',
};

const FORBIDDEN_KEY = 'tutoring.admin.errors.forbidden';
const PURGED_KEY = 'tutoring.admin.errors.documentPurged';
const VALIDATION_KEY = 'tutoring.admin.errors.validation';

/** Extension members an administrator-facing failure can carry (each documented next to its reason in the contracts). */
export interface AdminProblemExtras {
  /** `tutoring.refund_exceeds_cap`: the most the server will refund for this booking. */
  readonly maxRefundable?: number;
  /** `tutoring.kyc.documents_undecided`: the `KycDocumentType`s still blocking an approval. */
  readonly types?: readonly string[];
  /** A `400 validation` body: property name -> messages (never shown; only used to mark the field). */
  readonly errors?: Readonly<Record<string, readonly string[]>>;
}

export function adminProblemExtrasOf(error: unknown): AdminProblemExtras {
  return (tutoringProblemOf(error) as AdminProblemExtras | null) ?? {};
}

/**
 * The i18n key that explains a failed administrator call. A 403 (the role claim moved, or the Admin two-factor gate is not
 * met) and a bare 410 are recognised by status; a 400 validation body has no `reason` and reads as "check the form".
 */
export function tutoringAdminErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return FORBIDDEN_KEY;
    }
    const reason = tutoringReasonOf(error);
    if (reason !== undefined && ADMIN_REASON_KEYS[reason] !== undefined) {
      return ADMIN_REASON_KEYS[reason];
    }
    if (error.status === 410) {
      return PURGED_KEY;
    }
    if (error.status === 400 && reason === undefined && adminProblemExtrasOf(error).errors !== undefined) {
      return VALIDATION_KEY;
    }
  }
  return tutoringErrorKey(error);
}

/** `true` when the server says the whole feature is switched off (`503 tutoring.kyc.disabled`), which is a state, not a fault. */
export function isKycDisabled(error: unknown): boolean {
  return tutoringReasonOf(error) === 'tutoring.kyc.disabled';
}

/** `true` for the answers that mean "someone changed this under you - load it again" (stale token, already decided). */
export function isStaleConflict(error: unknown): boolean {
  const reason = tutoringReasonOf(error);
  return reason === 'tutoring.concurrent_update' || reason === 'tutoring.kyc.case_already_decided' || reason === 'tutoring.dispute_not_decidable';
}
