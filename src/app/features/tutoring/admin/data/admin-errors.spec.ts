import { ApiError } from '../../../../core/http/error.interceptor';
import { adminProblemExtrasOf, isKycDisabled, isStaleConflict, tutoringAdminErrorKey } from './admin-errors';

function failure(status: number, details?: object): ApiError {
  return new ApiError(status, 'x', undefined, details);
}

describe('tutoringAdminErrorKey', () => {
  it('maps the reasons only an administrator meets to the admin texts', () => {
    expect(tutoringAdminErrorKey(failure(409, { reason: 'tutoring.kyc.case_already_decided' }))).toBe('tutoring.admin.errors.caseAlreadyDecided');
    expect(tutoringAdminErrorKey(failure(400, { reason: 'tutoring.kyc.documents_undecided' }))).toBe('tutoring.admin.errors.documentsUndecided');
    expect(tutoringAdminErrorKey(failure(409, { reason: 'tutoring.dispute_not_decidable' }))).toBe('tutoring.admin.errors.disputeNotDecidable');
    expect(tutoringAdminErrorKey(failure(409, { reason: 'tutoring.refund_exceeds_cap' }))).toBe('tutoring.admin.errors.refundExceedsCap');
    expect(tutoringAdminErrorKey(failure(409, { reason: 'tutoring.invalid_transition' }))).toBe('tutoring.admin.errors.invalidTransition');
  });

  it('falls back to the shared tutoring texts for reasons the other screens meet too', () => {
    expect(tutoringAdminErrorKey(failure(409, { reason: 'tutoring.concurrent_update' }))).toBe('tutoring.errors.concurrentUpdate');
    expect(tutoringAdminErrorKey(failure(503, { reason: 'tutoring.kyc.disabled' }))).toBe('tutoring.errors.kyc.disabled');
    expect(tutoringAdminErrorKey(failure(404, { reason: 'tutoring.dispute_not_found' }))).toBe('tutoring.errors.disputeNotFound');
  });

  it('recognises a 403 and a bare 410 by status, and a rate limit by 429', () => {
    expect(tutoringAdminErrorKey(failure(403))).toBe('tutoring.admin.errors.forbidden');
    expect(tutoringAdminErrorKey(failure(410))).toBe('tutoring.admin.errors.documentPurged');
    expect(tutoringAdminErrorKey(failure(429))).toBe('tutoring.errors.rateLimited');
  });

  it('reads a 400 validation body without a reason as "check the form", and anything else as generic', () => {
    expect(tutoringAdminErrorKey(failure(400, { errors: { Reason: ['x'] } }))).toBe('tutoring.admin.errors.validation');
    expect(tutoringAdminErrorKey(failure(500))).toBe('tutoring.errors.generic');
    expect(tutoringAdminErrorKey(new Error('network'))).toBe('tutoring.errors.generic');
  });
});

describe('admin problem helpers', () => {
  it('exposes the extension members of a failure', () => {
    const error = failure(409, { reason: 'tutoring.refund_exceeds_cap', maxRefundable: 300, types: ['IdCard'] });
    expect(adminProblemExtrasOf(error).maxRefundable).toBe(300);
    expect(adminProblemExtrasOf(error).types).toEqual(['IdCard']);
    expect(adminProblemExtrasOf(new Error('x'))).toEqual({});
  });

  it('tells a switched-off feature apart from a fault', () => {
    expect(isKycDisabled(failure(503, { reason: 'tutoring.kyc.disabled' }))).toBe(true);
    expect(isKycDisabled(failure(503, { reason: 'tutoring.kyc.log_unavailable' }))).toBe(false);
  });

  it('treats a stale token and an already decided case as "load it again"', () => {
    expect(isStaleConflict(failure(409, { reason: 'tutoring.concurrent_update' }))).toBe(true);
    expect(isStaleConflict(failure(409, { reason: 'tutoring.kyc.case_already_decided' }))).toBe(true);
    expect(isStaleConflict(failure(409, { reason: 'tutoring.dispute_not_decidable' }))).toBe(true);
    expect(isStaleConflict(failure(409, { reason: 'tutoring.invalid_transition' }))).toBe(false);
  });
});
