import type { Locale } from '../../../core/i18n/translation.service';
import { localizedName } from '../data/tutoring-labels';
import type { PublicSubjectItem, TutorCurriculum, TutorLevel } from '../data/tutoring-public.models';
import type { TutorOffering, UpsertOfferingRequest } from '../data/tutoring-tutor.models';
import { type FieldIssues, amountIssue, integerIssue, issue, parseNumber } from '../ui/tutor-form.util';

export type OfferingField =
  | 'subjectId'
  | 'level'
  | 'curriculum'
  | 'hourlyRate'
  | 'groupEnabled'
  | 'groupRate'
  | 'groupSeats'
  | 'trialEnabled'
  | 'trialMinutes'
  | 'trialPrice';

/** Raw values of the offering form. Money / count fields are text so a half-typed value is representable. */
export interface OfferingFormValue {
  readonly subjectId: string;
  readonly level: TutorLevel;
  readonly curriculum: TutorCurriculum;
  readonly hourlyRate: string;
  readonly groupEnabled: boolean;
  readonly groupRate: string;
  readonly groupSeats: string;
  readonly trialEnabled: boolean;
  readonly trialMinutes: '15' | '30';
  readonly trialPrice: string;
  readonly isActive: boolean;
}

/** Group classes seat 2 to 6 learners (TUTORING.md section 1; also a CHECK constraint in the database). */
export const GROUP_SEATS = { min: 2, max: 6 } as const;
export const TRIAL_MINUTES_CHOICES: readonly ('15' | '30')[] = ['15', '30'];

/** C# property names of `UpsertOfferingRequest` -> form fields. */
export const OFFERING_PROPERTY_TO_FIELD: Readonly<Record<string, OfferingField>> = {
  SubjectId: 'subjectId',
  Level: 'level',
  Curriculum: 'curriculum',
  HourlyRateOneOnOne: 'hourlyRate',
  GroupHourlyRatePerSeat: 'groupRate',
  GroupMaxSeats: 'groupSeats',
  TrialMinutes: 'trialMinutes',
  TrialPrice: 'trialPrice',
};

export function emptyOfferingForm(): OfferingFormValue {
  return {
    subjectId: '',
    level: 'UpperSecondary',
    curriculum: 'Thai',
    hourlyRate: '',
    groupEnabled: false,
    groupRate: '',
    groupSeats: '4',
    trialEnabled: false,
    trialMinutes: '30',
    trialPrice: '0',
    isActive: true,
  };
}

export function offeringToForm(offering: TutorOffering): OfferingFormValue {
  return {
    subjectId: offering.subject.subjectId,
    level: offering.level,
    curriculum: offering.curriculum,
    hourlyRate: String(offering.hourlyRateOneOnOne),
    groupEnabled: offering.groupHourlyRatePerSeat !== null,
    groupRate: offering.groupHourlyRatePerSeat === null ? '' : String(offering.groupHourlyRatePerSeat),
    groupSeats: String(offering.groupMaxSeats ?? 4),
    trialEnabled: offering.trialEnabled,
    trialMinutes: offering.trialMinutes === 15 ? '15' : '30',
    trialPrice: offering.trialPrice === null ? '0' : String(offering.trialPrice),
    isActive: offering.isActive,
  };
}

/**
 * Structural rules of P13-01 section 5.5: a rate is a positive baht amount, a group offer needs both a per-seat rate that is
 * not above the one-to-one rate and 2-6 seats, a trial needs a length of 15/30 minutes and a price from free up to the
 * one-to-one rate. The allowed rate range is server configuration and is deliberately not checked here.
 */
export function validateOffering(value: OfferingFormValue): FieldIssues<OfferingField> {
  const issues: { -readonly [F in OfferingField]?: FieldIssues<OfferingField>[F] } = {};

  if (value.subjectId.length === 0) {
    issues.subjectId = issue('tutoring.tutor.validation.required');
  }

  issues.hourlyRate = amountIssue(value.hourlyRate, 0.01);
  const hourly = parseNumber(value.hourlyRate);

  if (value.groupEnabled) {
    issues.groupRate = amountIssue(value.groupRate, 0.01);
    const groupRate = parseNumber(value.groupRate);
    if (!issues.groupRate && !issues.hourlyRate && groupRate !== null && hourly !== null && groupRate > hourly) {
      issues.groupRate = issue('tutoring.tutor.validation.groupRateAbove');
    }
    issues.groupSeats = integerIssue(value.groupSeats, GROUP_SEATS.min, GROUP_SEATS.max);
  }

  if (value.trialEnabled) {
    issues.trialPrice = amountIssue(value.trialPrice, 0);
    const trialPrice = parseNumber(value.trialPrice);
    if (!issues.trialPrice && !issues.hourlyRate && trialPrice !== null && hourly !== null && trialPrice > hourly) {
      issues.trialPrice = issue('tutoring.tutor.validation.trialPriceAbove');
    }
  }

  return Object.fromEntries(Object.entries(issues).filter(([, found]) => found !== undefined)) as FieldIssues<OfferingField>;
}

/** The request body for a valid form; call only after `validateOffering` found nothing. */
export function offeringRequest(value: OfferingFormValue): UpsertOfferingRequest {
  return {
    subjectId: value.subjectId,
    level: value.level,
    curriculum: value.curriculum,
    hourlyRateOneOnOne: Number(parseNumber(value.hourlyRate)),
    groupHourlyRatePerSeat: value.groupEnabled ? Number(parseNumber(value.groupRate)) : null,
    groupMaxSeats: value.groupEnabled ? Number(parseNumber(value.groupSeats)) : null,
    trialEnabled: value.trialEnabled,
    trialMinutes: value.trialEnabled ? Number(value.trialMinutes) : null,
    trialPrice: value.trialEnabled ? Number(parseNumber(value.trialPrice)) : null,
    isActive: value.isActive,
  };
}

/** A subject the tutor can attach an offering to. */
export interface SelectableSubject {
  readonly subjectId: string;
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  /** The top-level group it sits under; `null` for a group itself, and for a subject the catalogue no longer lists. */
  readonly parentSlug: string | null;
  /** The subject was retired (it is not in the catalogue any more): an existing offering still shows it, a new one can not pick it. */
  readonly retired: boolean;
}

/** One option of the subject select, already localised. A group's own option comes first, its subjects follow, indented. */
export interface SubjectChoice {
  readonly subjectId: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** Indents a subject under its group inside a native `<select>` (which can not nest options) - same convention as the search filters. */
const CHILD_INDENT = '   ';

/**
 * The subjects the "offering" form can show: the active catalogue (`GET /api/tutoring/subjects`, whose items carry the `subjectId` an
 * offering needs - P13-04 revision 3), in the server's order, plus the subjects of the tutor's own offerings that the catalogue no
 * longer lists (retired ones). Those keep an existing offering readable in the editor; they are flagged `retired` so a NEW offering
 * can not pick one, since the server would refuse it (`404 tutoring.subject_not_found`).
 */
export function selectableSubjects(catalogue: readonly PublicSubjectItem[], offerings: readonly TutorOffering[]): readonly SelectableSubject[] {
  const byId = new Map<string, SelectableSubject>();
  for (const entry of catalogue) {
    byId.set(entry.subjectId, {
      subjectId: entry.subjectId,
      slug: entry.slug,
      nameTh: entry.nameTh,
      nameEn: entry.nameEn,
      parentSlug: entry.parentSlug,
      retired: false,
    });
  }
  for (const offering of offerings) {
    if (!byId.has(offering.subject.subjectId)) {
      byId.set(offering.subject.subjectId, {
        subjectId: offering.subject.subjectId,
        slug: offering.subject.slug,
        nameTh: offering.subject.nameTh,
        nameEn: offering.subject.nameEn,
        parentSlug: null,
        retired: true,
      });
    }
  }
  return [...byId.values()];
}

/**
 * The select options, grouped by parent: every top-level subject first (a group is itself a subject a tutor may teach), each followed by the
 * subjects under it. A subject whose group is not in the list (for example a retired group) is shown on its own rather than lost.
 */
export function subjectChoicesOf(subjects: readonly SelectableSubject[], locale: Locale): readonly SubjectChoice[] {
  const label = (subject: SelectableSubject): string => localizedName(subject, locale);
  const choice = (subject: SelectableSubject, text: string): SubjectChoice => ({
    subjectId: subject.subjectId,
    label: text,
    ...(subject.retired ? { disabled: true } : {}),
  });

  const slugs = new Set(subjects.map((subject) => subject.slug));
  const isChild = (subject: SelectableSubject): boolean => subject.parentSlug !== null && slugs.has(subject.parentSlug);
  const out: SubjectChoice[] = [];
  for (const top of subjects.filter((subject) => !isChild(subject))) {
    out.push(choice(top, label(top)));
    for (const child of subjects.filter((subject) => subject.parentSlug === top.slug)) {
      out.push(choice(child, `${CHILD_INDENT}${label(child)}`));
    }
  }
  return out;
}
