import type { LearnerProfile } from '../data/tutoring-learner.models';
import {
  GUARDIAN_CONSENT_VERSION,
  LEARNER_GRADES,
  type LearnerFormValue,
  emptyLearnerForm,
  isSchoolGrade,
  learnerProfileRequest,
  learnerToForm,
  validateLearnerProfile,
} from './learner-profile-form.util';

const valid: LearnerFormValue = { nickname: 'Mint', gradeLevel: 'Secondary4', isMinor: true, guardianConsent: true };

describe('isSchoolGrade', () => {
  it('is true for every primary and secondary grade and false for the rest', () => {
    expect(LEARNER_GRADES.filter(isSchoolGrade)).toEqual([
      'Primary1', 'Primary2', 'Primary3', 'Primary4', 'Primary5', 'Primary6',
      'Secondary1', 'Secondary2', 'Secondary3', 'Secondary4', 'Secondary5', 'Secondary6',
    ]);
    for (const grade of ['Vocational', 'University', 'Adult', 'Other'] as const) {
      expect(isSchoolGrade(grade)).toBe(false);
    }
  });
});

describe('emptyLearnerForm', () => {
  it('never starts with guardian consent ticked', () => {
    expect(emptyLearnerForm().guardianConsent).toBe(false);
  });
});

describe('learnerToForm', () => {
  const profile: LearnerProfile = {
    learnerProfileId: 'lp-1',
    nickname: 'Mint',
    gradeLevel: 'Primary3',
    isMinor: true,
    guardianConsentAtUtc: '2026-10-14T03:00:00Z',
    guardianConsentVersion: GUARDIAN_CONSENT_VERSION,
    isActive: true,
  };

  it('loads the stored values but asks for the consent again - it is explicit on every save', () => {
    expect(learnerToForm(profile)).toEqual({ nickname: 'Mint', gradeLevel: 'Primary3', isMinor: true, guardianConsent: false });
  });
});

describe('validateLearnerProfile', () => {
  it('accepts a minor with a nickname and the guardian consent', () => {
    expect(validateLearnerProfile(valid)).toEqual({});
  });

  it('accepts an adult learner without any consent', () => {
    expect(validateLearnerProfile({ nickname: 'Pim', gradeLevel: 'Adult', isMinor: false, guardianConsent: false })).toEqual({});
  });

  it('requires a nickname, and trims before counting', () => {
    expect(validateLearnerProfile({ ...valid, nickname: '   ' }).nickname?.key).toBe('tutoring.learner.validation.nicknameRequired');
    expect(validateLearnerProfile({ ...valid, nickname: '  Mint  ' }).nickname).toBeUndefined();
  });

  it('allows exactly 40 characters and refuses 41', () => {
    expect(validateLearnerProfile({ ...valid, nickname: 'a'.repeat(40) }).nickname).toBeUndefined();
    expect(validateLearnerProfile({ ...valid, nickname: 'a'.repeat(41) }).nickname).toMatchObject({
      key: 'tutoring.learner.validation.nicknameTooLong',
      params: { max: 40 },
    });
  });

  it('refuses angle brackets', () => {
    expect(validateLearnerProfile({ ...valid, nickname: '<b>Mint' }).nickname?.key).toBe('tutoring.learner.validation.nicknameMarkup');
  });

  it('refuses something that looks like an e-mail address or a phone number', () => {
    expect(validateLearnerProfile({ ...valid, nickname: 'mint@example.test' }).nickname?.key).toBe('tutoring.learner.validation.nicknamePersonal');
    expect(validateLearnerProfile({ ...valid, nickname: 'Mint 0812345678' }).nickname?.key).toBe('tutoring.learner.validation.nicknamePersonal');
    expect(validateLearnerProfile({ ...valid, nickname: 'Mint 123456' }).nickname).toBeUndefined();
  });

  it('requires the guardian consent for a minor and for any school grade, even when the minor box is off', () => {
    expect(validateLearnerProfile({ ...valid, guardianConsent: false }).guardianConsent?.key).toBe('tutoring.learner.validation.consentRequired');
    expect(validateLearnerProfile({ nickname: 'Mint', gradeLevel: 'Primary2', isMinor: false, guardianConsent: false }).guardianConsent).toBeDefined();
  });
});

describe('learnerProfileRequest', () => {
  it('sends the trimmed nickname with the consent and its version for a minor', () => {
    expect(learnerProfileRequest({ ...valid, nickname: '  Mint ' })).toEqual({
      nickname: 'Mint',
      gradeLevel: 'Secondary4',
      isMinor: true,
      guardianConsent: true,
      guardianConsentVersion: GUARDIAN_CONSENT_VERSION,
    });
  });

  it('forces isMinor for a school grade, as the server does', () => {
    expect(learnerProfileRequest({ nickname: 'Mint', gradeLevel: 'Primary1', isMinor: false, guardianConsent: true }).isMinor).toBe(true);
  });

  it('sends no consent and no version for an adult, whatever the form still holds', () => {
    expect(learnerProfileRequest({ nickname: 'Pim', gradeLevel: 'University', isMinor: false, guardianConsent: true })).toEqual({
      nickname: 'Pim',
      gradeLevel: 'University',
      isMinor: false,
      guardianConsent: false,
      guardianConsentVersion: null,
    });
  });
});
