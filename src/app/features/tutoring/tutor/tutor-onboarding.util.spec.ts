import type { KycCase, TutorKycStatus } from '../data/tutoring-kyc.models';
import type { TutorProfile, TutorStatus } from '../data/tutoring-tutor.models';
import { onboardingStep, profileBlockers, reviewerMessage } from './tutor-onboarding.util';

function profile(status: TutorStatus, blockers: readonly string[] = [], statusReason: string | null = null): TutorProfile {
  return {
    tutorId: 't1',
    slug: 'nina',
    displayName: 'Nina',
    headline: 'Physics',
    bio: 'Bio',
    gender: 'Female',
    yearsExperience: 3,
    status,
    statusReason,
    isListed: false,
    photoUrl: null,
    introVideoAssetId: null,
    minNoticeHours: 24,
    bufferMinutes: 10,
    maxAdvanceDays: 60,
    verifiedAtUtc: null,
    readiness: { canSubmitForVerification: blockers.length === 0, blockers },
    allowedDurationMinutes: [60],
    rowVersion: 'AAA=',
  };
}

function kycCase(status: KycCase['status'], attemptNo = 1, decisionNote: string | null = null): KycCase {
  return { caseId: `c${attemptNo}`, attemptNo, status, submittedAtUtc: null, decidedAtUtc: null, decisionNote, consentVersion: 'v1', documents: [] };
}

function kyc(overrides: Partial<TutorKycStatus> = {}): TutorKycStatus {
  return {
    enabled: true,
    consentVersion: 'v1',
    requiredDocumentTypes: ['IdCard'],
    currentCase: null,
    history: [],
    canStartNewCase: true,
    maxFileBytes: 10_485_760,
    allowedExtensions: ['.pdf'],
    ...overrides,
  };
}

describe('onboardingStep', () => {
  it('asks a tutor without a profile to create one', () => {
    expect(onboardingStep(null, null)).toBe('createProfile');
  });

  it('keeps a draft on the profile while the profile itself has blockers', () => {
    expect(onboardingStep(profile('Draft', ['bio_too_short']), kyc())).toBe('completeProfile');
    expect(onboardingStep(profile('Draft', ['no_active_offering', 'kyc_case_missing']), kyc())).toBe('completeProfile');
  });

  it('ignores kyc_* blockers when deciding the profile is complete', () => {
    expect(profileBlockers(profile('Draft', ['kyc_case_missing', 'bio_too_short']))).toEqual(['bio_too_short']);
    expect(onboardingStep(profile('Draft', ['kyc_case_missing']), kyc())).toBe('startVerification');
  });

  it('continues an open draft case instead of starting another', () => {
    expect(onboardingStep(profile('Draft'), kyc({ currentCase: kycCase('Draft') }))).toBe('continueVerification');
  });

  it('maps the remaining statuses', () => {
    expect(onboardingStep(profile('PendingVerification'), null)).toBe('awaitingReview');
    expect(onboardingStep(profile('Verified'), null)).toBe('verified');
    expect(onboardingStep(profile('Suspended'), null)).toBe('suspended');
    expect(onboardingStep(profile('NeedsInfo'), kyc({ currentCase: kycCase('NeedsInfo') }))).toBe('needsInfo');
    expect(onboardingStep(profile('Rejected'), kyc({ history: [kycCase('Rejected')] }))).toBe('rejected');
  });

  it('says verification is unavailable when the feature is off, for every status that still needs it', () => {
    expect(onboardingStep(profile('Draft'), null)).toBe('verificationUnavailable');
    expect(onboardingStep(profile('Draft'), kyc({ enabled: false }))).toBe('verificationUnavailable');
    expect(onboardingStep(profile('NeedsInfo'), null)).toBe('verificationUnavailable');
    expect(onboardingStep(profile('Rejected'), null)).toBe('verificationUnavailable');
  });
});

describe('reviewerMessage', () => {
  it('prefers the profile reason, then the open case note, then the newest past attempt', () => {
    expect(reviewerMessage(profile('Suspended', [], 'Too many no-shows'), null)).toBe('Too many no-shows');
    expect(reviewerMessage(profile('NeedsInfo'), kyc({ currentCase: kycCase('NeedsInfo', 2, 'Upload a clearer ID') }))).toBe('Upload a clearer ID');
    expect(
      reviewerMessage(profile('Rejected'), kyc({ history: [kycCase('Rejected', 1, 'old reason'), kycCase('Rejected', 3, 'newest reason'), kycCase('Rejected', 2, 'older')] })),
    ).toBe('newest reason');
    expect(reviewerMessage(profile('Draft'), kyc())).toBeNull();
  });
});
