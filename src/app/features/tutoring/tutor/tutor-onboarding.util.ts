import type { TutorKycStatus } from '../data/tutoring-kyc.models';
import type { TutorProfile } from '../data/tutoring-tutor.models';

/**
 * Where the tutor stands on the road to being verified, which decides the one call to action the hub puts first.
 * Pure on purpose: the screen only presents it. The state machine itself (who may become `Verified`) is the server's.
 */
export type OnboardingStep =
  /** No tutor profile yet. */
  | 'createProfile'
  /** `Draft` and the profile (not the identity documents) still has blockers. */
  | 'completeProfile'
  /** `Draft` and ready: the next thing is to accept the consent and open the verification case. */
  | 'startVerification'
  /** A draft case is open: documents and the final submit are what is left. */
  | 'continueVerification'
  | 'awaitingReview'
  /** An administrator asked for more information. */
  | 'needsInfo'
  | 'rejected'
  | 'verified'
  | 'suspended'
  /** The verification feature is switched off server-side, so a not-yet-verified tutor cannot progress. */
  | 'verificationUnavailable';

/** Blockers that concern the profile itself; `kyc_*` ones are settled on the verification page. */
export function profileBlockers(profile: TutorProfile): readonly string[] {
  return profile.readiness.blockers.filter((code) => !code.startsWith('kyc_'));
}

/**
 * @param profile the tutor's profile, or `null` when they have none yet
 * @param kyc the verification status, or `null` when the feature is switched off (`503 tutoring.kyc.disabled`)
 */
export function onboardingStep(profile: TutorProfile | null, kyc: TutorKycStatus | null): OnboardingStep {
  if (profile === null) {
    return 'createProfile';
  }
  switch (profile.status) {
    case 'Verified':
      return 'verified';
    case 'Suspended':
      return 'suspended';
    case 'PendingVerification':
      return 'awaitingReview';
    case 'NeedsInfo':
      return kyc === null || !kyc.enabled ? 'verificationUnavailable' : 'needsInfo';
    case 'Rejected':
      return kyc === null || !kyc.enabled ? 'verificationUnavailable' : 'rejected';
    default:
      if (profileBlockers(profile).length > 0) {
        return 'completeProfile';
      }
      if (kyc === null || !kyc.enabled) {
        return 'verificationUnavailable';
      }
      return kyc.currentCase !== null ? 'continueVerification' : 'startVerification';
  }
}

/** The sentence an administrator left for the tutor: the profile's reason, else the latest case's note. */
export function reviewerMessage(profile: TutorProfile, kyc: TutorKycStatus | null): string | null {
  if (profile.statusReason) {
    return profile.statusReason;
  }
  const newestPast = kyc ? [...kyc.history].sort((a, b) => b.attemptNo - a.attemptNo)[0] : undefined;
  return (kyc?.currentCase ?? newestPast)?.decisionNote ?? null;
}
