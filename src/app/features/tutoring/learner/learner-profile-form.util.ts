import { type FieldIssues, issue } from '../ui/tutor-form.util';
import type { LearnerGrade, LearnerProfile, UpsertLearnerProfileRequest } from '../data/tutoring-learner.models';

export const LEARNER_GRADES: readonly LearnerGrade[] = [
  'Primary1',
  'Primary2',
  'Primary3',
  'Primary4',
  'Primary5',
  'Primary6',
  'Secondary1',
  'Secondary2',
  'Secondary3',
  'Secondary4',
  'Secondary5',
  'Secondary6',
  'Vocational',
  'University',
  'Adult',
  'Other',
];

/**
 * Version of the guardian-consent text this build shows. It mirrors the default of the server option
 * `Tutoring:LearnerProfiles:GuardianConsentVersion` (P13-05 section 9). No endpoint publishes the live value, so the server
 * is the authority: a profile saved against another version is refused with `400 tutoring.guardian_consent_required` carrying
 * `currentVersion`, and the form then asks the person to reload to read the current text instead of re-sending a version
 * whose text it never showed.
 */
export const GUARDIAN_CONSENT_VERSION = '2026-10-v1';

export const NICKNAME_MAX_LENGTH = 40;
/** A run of this many digits looks like a phone number (P13-05 section 4). */
const PHONE_LIKE_DIGITS = 7;

export type LearnerProfileField = 'nickname' | 'gradeLevel' | 'guardianConsent';

/** C# property names of `UpsertLearnerProfileRequest` -> form fields (a 400 `errors` object is keyed by them). */
export const LEARNER_PROPERTY_TO_FIELD: Readonly<Record<string, LearnerProfileField>> = {
  Nickname: 'nickname',
  GradeLevel: 'gradeLevel',
  GuardianConsent: 'guardianConsent',
  GuardianConsentVersion: 'guardianConsent',
};

/** Raw values of the learner-profile form. */
export interface LearnerFormValue {
  readonly nickname: string;
  readonly gradeLevel: LearnerGrade;
  readonly isMinor: boolean;
  readonly guardianConsent: boolean;
}

/** Primary and secondary school grades are minors by definition; the server forces `isMinor` for them (P13-05 section 4). */
export function isSchoolGrade(grade: LearnerGrade): boolean {
  return grade.startsWith('Primary') || grade.startsWith('Secondary');
}

/** Blank form for a new learner. Consent is never pre-ticked. */
export function emptyLearnerForm(): LearnerFormValue {
  return { nickname: '', gradeLevel: 'Secondary4', isMinor: true, guardianConsent: false };
}

/**
 * The form for editing `profile`. `guardianConsent` always starts unticked - even when consent was given before - because
 * the server asks for an explicit `guardianConsent: true` on every save of a minor's profile.
 */
export function learnerToForm(profile: LearnerProfile): LearnerFormValue {
  return { nickname: profile.nickname, gradeLevel: profile.gradeLevel, isMinor: profile.isMinor, guardianConsent: false };
}

/**
 * Structural rules of P13-05 section 4: a 1-40 character nickname with no markup, no e-mail and no phone-number look, and
 * the guardian's consent when the learner is a minor. They are a convenience (the person learns about a mistake before the
 * round trip); the server re-validates and its answer wins.
 */
export function validateLearnerProfile(value: LearnerFormValue): FieldIssues<LearnerProfileField> {
  const issues: { -readonly [F in LearnerProfileField]?: FieldIssues<LearnerProfileField>[F] } = {};
  const nickname = value.nickname.trim();

  if (nickname.length === 0) {
    issues.nickname = issue('tutoring.learner.validation.nicknameRequired');
  } else if (nickname.length > NICKNAME_MAX_LENGTH) {
    issues.nickname = issue('tutoring.learner.validation.nicknameTooLong', { max: NICKNAME_MAX_LENGTH });
  } else if (/[<>]/.test(nickname)) {
    issues.nickname = issue('tutoring.learner.validation.nicknameMarkup');
  } else if (nickname.includes('@') || new RegExp(`\\d{${PHONE_LIKE_DIGITS},}`).test(nickname)) {
    issues.nickname = issue('tutoring.learner.validation.nicknamePersonal');
  }

  if ((value.isMinor || isSchoolGrade(value.gradeLevel)) && !value.guardianConsent) {
    issues.guardianConsent = issue('tutoring.learner.validation.consentRequired');
  }

  return issues;
}

/** The request body for a valid form; call only after `validateLearnerProfile` found nothing. */
export function learnerProfileRequest(value: LearnerFormValue): UpsertLearnerProfileRequest {
  const minor = value.isMinor || isSchoolGrade(value.gradeLevel);
  return {
    nickname: value.nickname.trim(),
    gradeLevel: value.gradeLevel,
    isMinor: minor,
    guardianConsent: minor && value.guardianConsent,
    guardianConsentVersion: minor ? GUARDIAN_CONSENT_VERSION : null,
  };
}

