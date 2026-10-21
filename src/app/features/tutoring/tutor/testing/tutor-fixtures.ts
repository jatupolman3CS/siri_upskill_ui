/**
 * Test fixtures of the Tutor Portal specs: well-formed API payloads that individual tests override. Not used by the app.
 */
import type { PagedResult } from '../../../../core/http/paged-result.model';
import type { KycCase, KycDocument, TutorKycStatus } from '../../data/tutoring-kyc.models';
import type { TutorOffering, TutorProfile } from '../../data/tutoring-tutor.models';

export function tutorProfile(overrides: Partial<TutorProfile> = {}): TutorProfile {
  return {
    tutorId: 'tutor-1',
    slug: 'nina-tutor',
    displayName: 'Nina Tutor',
    headline: 'Physics for upper secondary',
    bio: 'I have taught physics for six years and love practice-first lessons.',
    gender: 'Female',
    yearsExperience: 6,
    status: 'Draft',
    statusReason: null,
    isListed: false,
    photoUrl: null,
    introVideoAssetId: null,
    minNoticeHours: 24,
    bufferMinutes: 10,
    maxAdvanceDays: 60,
    verifiedAtUtc: null,
    readiness: { canSubmitForVerification: true, blockers: [] },
    rowVersion: 'AAAAAAAAB9E=',
    ...overrides,
  };
}

export function pagedOf<T>(items: readonly T[]): PagedResult<T> {
  return { items, totalCount: items.length, page: 1, pageSize: 100, totalPages: 1 };
}

export function tutorOffering(overrides: Partial<TutorOffering> = {}): TutorOffering {
  return {
    offeringId: 'off-1',
    subject: { subjectId: 'sub-physics', slug: 'physics', nameTh: 'Physics (TH)', nameEn: 'Physics' },
    level: 'UpperSecondary',
    curriculum: 'Thai',
    hourlyRateOneOnOne: 450,
    groupHourlyRatePerSeat: null,
    groupMaxSeats: null,
    trialEnabled: false,
    trialMinutes: null,
    trialPrice: null,
    isActive: true,
    ...overrides,
  };
}

export function kycDocument(overrides: Partial<KycDocument> = {}): KycDocument {
  return {
    documentId: 'doc-1',
    type: 'IdCard',
    status: 'Pending',
    uploadedAtUtc: '2026-10-14T05:00:00Z',
    expiresAtUtc: null,
    purged: false,
    ...overrides,
  };
}

export function kycCase(overrides: Partial<KycCase> = {}): KycCase {
  return {
    caseId: 'case-1',
    attemptNo: 1,
    status: 'Draft',
    submittedAtUtc: null,
    decidedAtUtc: null,
    decisionNote: null,
    consentVersion: '2026-10-v1',
    documents: [],
    ...overrides,
  };
}

export function kycStatus(overrides: Partial<TutorKycStatus> = {}): TutorKycStatus {
  return {
    enabled: true,
    consentVersion: '2026-10-v1',
    requiredDocumentTypes: ['IdCard', 'Diploma', 'CriminalRecord'],
    currentCase: null,
    history: [],
    canStartNewCase: true,
    maxFileBytes: 10_485_760,
    allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    ...overrides,
  };
}
