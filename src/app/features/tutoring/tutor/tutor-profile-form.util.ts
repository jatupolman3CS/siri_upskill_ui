import type { TutorGender } from '../data/tutoring-public.models';
import type { CreateTutorProfileRequest, TutorProfile } from '../data/tutoring-tutor.models';
import { type FieldIssues, integerIssue, issue, optionalTextIssue, textIssue, trimToNull } from '../ui/tutor-form.util';

export type ProfileField = 'displayName' | 'headline' | 'bio' | 'gender' | 'yearsExperience';

/** Raw values of the profile form (number fields are text so a half-typed value is representable). */
export interface ProfileFormValue {
  readonly displayName: string;
  readonly headline: string;
  readonly bio: string;
  readonly gender: TutorGender;
  readonly yearsExperience: string;
}

/** Structural limits of P13-01 section 5.5. */
export const PROFILE_LIMITS = { displayNameMin: 2, displayNameMax: 80, headlineMax: 120, bioMax: 4000, yearsMax: 60 } as const;

/** C# property names of the create/update records -> form fields, for routing a `400 validation` answer to a field. */
export const PROFILE_PROPERTY_TO_FIELD: Readonly<Record<string, ProfileField>> = {
  DisplayName: 'displayName',
  Headline: 'headline',
  Bio: 'bio',
  Gender: 'gender',
  YearsExperience: 'yearsExperience',
};

export function emptyProfileForm(): ProfileFormValue {
  return { displayName: '', headline: '', bio: '', gender: 'Undisclosed', yearsExperience: '0' };
}

export function profileToForm(profile: TutorProfile): ProfileFormValue {
  return {
    displayName: profile.displayName,
    headline: profile.headline ?? '',
    bio: profile.bio,
    gender: profile.gender,
    yearsExperience: String(profile.yearsExperience),
  };
}

export function validateProfile(value: ProfileFormValue): FieldIssues<ProfileField> {
  const issues: { -readonly [F in ProfileField]?: FieldIssues<ProfileField>[F] } = {};

  issues.displayName =
    textIssue(value.displayName, PROFILE_LIMITS.displayNameMin, PROFILE_LIMITS.displayNameMax) ??
    (/[<>]/.test(value.displayName) ? issue('tutoring.tutor.validation.noMarkup') : undefined);
  issues.headline = optionalTextIssue(value.headline, PROFILE_LIMITS.headlineMax);
  issues.bio = optionalTextIssue(value.bio, PROFILE_LIMITS.bioMax);
  issues.yearsExperience = integerIssue(value.yearsExperience, 0, PROFILE_LIMITS.yearsMax);

  return Object.fromEntries(Object.entries(issues).filter(([, found]) => found !== undefined)) as FieldIssues<ProfileField>;
}

/** The request body for a valid form; call only after `validateProfile` found nothing. */
export function profileRequest(value: ProfileFormValue): CreateTutorProfileRequest {
  return {
    displayName: value.displayName.trim(),
    headline: trimToNull(value.headline),
    bio: value.bio.trim(),
    gender: value.gender,
    yearsExperience: Number(value.yearsExperience.trim()),
  };
}
