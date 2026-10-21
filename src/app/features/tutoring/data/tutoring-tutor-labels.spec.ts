import { ApiError } from '../../../core/http/error.interceptor';
import { TUTORING_EN as en, TUTORING_TH as th } from '../testing/tutoring-i18n';
import { tutoringErrorKey, tutoringReasonOf } from './tutoring-errors';
import {
  KYC_CASE_STATUSES,
  KYC_DOCUMENT_STATUSES,
  KYC_DOCUMENT_TYPES,
  READINESS_BLOCKERS,
  REFUND_REASONS,
  TUTOR_STATUSES,
  kycCaseStatusLabelKey,
  kycDocumentStatusLabelKey,
  kycDocumentStatusTone,
  kycDocumentTypeLabelKey,
  readinessBlockerKey,
  readinessBlockerRoute,
  refundReasonLabelKey,
  tutorStatusLabelKey,
  tutorStatusTone,
} from './tutoring-tutor-labels';

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

function expectInBoth(key: string): void {
  expect(typeof lookup(th, key), `th: ${key}`).toBe('string');
  expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
}

function problem(status: number, reason?: string): ApiError {
  return new ApiError(status, 'x', 'conflict', { status, reason });
}

describe('tutor portal enum label keys', () => {
  // Built at runtime, so i18n-guard.spec cannot see them - this is their guard.
  const keys = [
    ...TUTOR_STATUSES.map(tutorStatusLabelKey),
    ...KYC_CASE_STATUSES.map(kycCaseStatusLabelKey),
    ...KYC_DOCUMENT_TYPES.map(kycDocumentTypeLabelKey),
    ...KYC_DOCUMENT_STATUSES.map(kycDocumentStatusLabelKey),
    ...REFUND_REASONS.map(refundReasonLabelKey),
    ...READINESS_BLOCKERS.map(readinessBlockerKey),
    'tutoring.enums.refundReason.unknown',
    'tutoring.tutor.readiness.unknown',
  ];

  it('covers every value of every enum', () => {
    expect(TUTOR_STATUSES).toHaveLength(6);
    expect(KYC_CASE_STATUSES).toHaveLength(6);
    expect(KYC_DOCUMENT_TYPES).toHaveLength(5);
    expect(KYC_DOCUMENT_STATUSES).toHaveLength(3);
  });

  it.each(keys)('%s resolves in Thai and English', (key) => {
    expectInBoth(key);
  });

  it('shows an unknown blocker code as the generic line, never as the raw code', () => {
    expect(readinessBlockerKey('something_new')).toBe('tutoring.tutor.readiness.unknown');
  });

  it('sends each blocker to the screen that fixes it', () => {
    expect(readinessBlockerRoute('no_active_offering')).toBe('/instructor/tutoring/offerings');
    expect(readinessBlockerRoute('kyc_documents_missing')).toBe('/instructor/tutoring/kyc');
    expect(readinessBlockerRoute('bio_too_short')).toBe('/instructor/tutoring/profile');
  });

  it('uses only token tone classes for status chips', () => {
    expect(TUTOR_STATUSES.map(tutorStatusTone).every((tone) => tone === '' || /^tone-[a-z]+$/.test(tone))).toBe(true);
    expect(kycDocumentStatusTone('Approved')).toBe('tone-green');
    expect(kycDocumentStatusTone('Rejected')).toBe('tone-red');
  });
});

describe('dynamically built Tutor Portal keys', () => {
  const STEPS = [
    'createProfile',
    'completeProfile',
    'startVerification',
    'continueVerification',
    'awaitingReview',
    'needsInfo',
    'rejected',
    'verified',
    'suspended',
    'verificationUnavailable',
  ];
  const STEPS_WITH_ACTION = ['createProfile', 'completeProfile', 'startVerification', 'continueVerification', 'needsInfo', 'rejected'];

  it.each(STEPS)('has a title and a body for the hub step %s', (step) => {
    expectInBoth(`tutoring.tutor.hub.step.${step}.title`);
    expectInBoth(`tutoring.tutor.hub.step.${step}.body`);
  });

  it.each(STEPS_WITH_ACTION)('has a call-to-action label for the hub step %s', (step) => {
    expectInBoth(`tutoring.tutor.hub.step.${step}.cta`);
  });

  it.each(['title', 'purpose', 'data', 'access', 'retention', 'rights'])('has the %s paragraph of the current consent version', (part) => {
    expectInBoth(`tutoring.kyc.consent.2026-10-v1.${part}`);
  });
});

describe('Tutor Portal error reasons', () => {
  const REASONS: readonly (readonly [string, string])[] = [
    ['tutoring.instructor_not_approved', 'tutoring.errors.instructorNotApproved'],
    ['tutoring.tutor_profile_not_found', 'tutoring.errors.tutorProfileNotFound'],
    ['tutoring.tutor_profile_exists', 'tutoring.errors.tutorProfileExists'],
    ['tutoring.slug_conflict', 'tutoring.errors.slugConflict'],
    ['tutoring.tutor_suspended', 'tutoring.errors.tutorSuspended'],
    ['tutoring.tutor_not_verified', 'tutoring.errors.tutorNotVerified'],
    ['tutoring.no_active_offering', 'tutoring.errors.noActiveOffering'],
    ['tutoring.concurrent_update', 'tutoring.errors.concurrentUpdate'],
    ['tutoring.not_found', 'tutoring.errors.notFound'],
    ['tutoring.offering_duplicate', 'tutoring.errors.offeringDuplicate'],
    ['tutoring.offering_limit', 'tutoring.errors.offeringLimit'],
    ['tutoring.subject_not_found', 'tutoring.errors.subjectNotFound'],
    ['tutoring.education_limit', 'tutoring.errors.educationLimit'],
    ['tutoring.certificate_limit', 'tutoring.errors.certificateLimit'],
    ['tutoring.media_asset_not_found', 'tutoring.errors.mediaAssetNotFound'],
    ['tutoring.intro_video_not_ready', 'tutoring.errors.introVideoNotReady'],
    ['tutoring.intro_video_duration_invalid', 'tutoring.errors.introVideoDurationInvalid'],
    ['tutoring.image_invalid', 'tutoring.errors.imageInvalid'],
    ['tutoring.text_contains_markup', 'tutoring.errors.textContainsMarkup'],
    ['storage.provider_not_configured', 'tutoring.errors.storageUnavailable'],
    ['tutoring.kyc.disabled', 'tutoring.errors.kyc.disabled'],
    ['tutoring.kyc.consent_outdated', 'tutoring.errors.kyc.consentOutdated'],
    ['tutoring.kyc.case_open', 'tutoring.errors.kyc.caseOpen'],
    ['tutoring.kyc.not_required', 'tutoring.errors.kyc.notRequired'],
    ['tutoring.kyc.attempts_exceeded', 'tutoring.errors.kyc.attemptsExceeded'],
    ['tutoring.kyc.file_rejected', 'tutoring.errors.kyc.fileRejected'],
    ['tutoring.kyc.expiry_invalid', 'tutoring.errors.kyc.expiryInvalid'],
    ['tutoring.kyc.case_not_editable', 'tutoring.errors.kyc.caseNotEditable'],
    ['tutoring.kyc.document_limit', 'tutoring.errors.kyc.documentLimit'],
    ['tutoring.kyc.document_locked', 'tutoring.errors.kyc.documentLocked'],
    ['tutoring.kyc.documents_missing', 'tutoring.errors.kyc.documentsMissing'],
    ['tutoring.kyc.profile_incomplete', 'tutoring.errors.kyc.profileIncomplete'],
  ];

  it.each(REASONS)('maps %s to %s, which exists in both dictionaries', (reason, key) => {
    expect(tutoringErrorKey(problem(409, reason))).toBe(key);
    expectInBoth(key);
  });

  it('recognises an oversized request by its status alone (no reason in that response)', () => {
    expect(tutoringErrorKey(new ApiError(413, 'x'))).toBe('tutoring.errors.fileTooLarge');
    expectInBoth('tutoring.errors.fileTooLarge');
  });

  it('exposes the reason of a failure, and nothing for a failure without one', () => {
    expect(tutoringReasonOf(problem(404, 'tutoring.tutor_profile_not_found'))).toBe('tutoring.tutor_profile_not_found');
    expect(tutoringReasonOf(new ApiError(500, 'x'))).toBeUndefined();
    expect(tutoringReasonOf(new Error('boom'))).toBeUndefined();
  });
});
