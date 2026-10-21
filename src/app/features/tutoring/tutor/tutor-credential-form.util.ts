import type { TutorCertificate, TutorEducation, UpsertCertificateRequest, UpsertEducationRequest } from '../data/tutoring-tutor.models';
import { type FieldIssues, integerIssue, issue, optionalTextIssue, parseNumber, textIssue, trimToNull } from '../ui/tutor-form.util';

/** Earliest year the API accepts for an education or certificate. */
const MIN_YEAR = 1950;
/** Furthest an education may end beyond the current year ("expected graduation"). */
const MAX_YEARS_AHEAD = 8;

export type EducationField = 'institution' | 'degree' | 'field' | 'yearFrom' | 'yearTo';
export type CertificateField = 'title' | 'issuer' | 'year';

export interface EducationFormValue {
  readonly institution: string;
  readonly degree: string;
  readonly field: string;
  readonly yearFrom: string;
  readonly yearTo: string;
}

export interface CertificateFormValue {
  readonly title: string;
  readonly issuer: string;
  readonly year: string;
}

export const EDUCATION_PROPERTY_TO_FIELD: Readonly<Record<string, EducationField>> = {
  Institution: 'institution',
  Degree: 'degree',
  Field: 'field',
  YearFrom: 'yearFrom',
  YearTo: 'yearTo',
};

export const CERTIFICATE_PROPERTY_TO_FIELD: Readonly<Record<string, CertificateField>> = {
  Title: 'title',
  Issuer: 'issuer',
  Year: 'year',
};

export const emptyEducationForm = (): EducationFormValue => ({ institution: '', degree: '', field: '', yearFrom: '', yearTo: '' });
export const emptyCertificateForm = (): CertificateFormValue => ({ title: '', issuer: '', year: '' });

export function educationToForm(education: TutorEducation): EducationFormValue {
  return {
    institution: education.institution,
    degree: education.degree,
    field: education.field ?? '',
    yearFrom: String(education.yearFrom),
    yearTo: education.yearTo === null ? '' : String(education.yearTo),
  };
}

export function certificateToForm(certificate: TutorCertificate): CertificateFormValue {
  return { title: certificate.title, issuer: certificate.issuer ?? '', year: String(certificate.year) };
}

function compact<F extends string>(issues: { [K in F]?: FieldIssues<F>[K] }): FieldIssues<F> {
  return Object.fromEntries(Object.entries(issues).filter(([, found]) => found !== undefined)) as FieldIssues<F>;
}

/** `currentYear` is the year in Thailand (see `bangkokYear`). */
export function validateEducation(value: EducationFormValue, currentYear: number): FieldIssues<EducationField> {
  const issues: { -readonly [F in EducationField]?: FieldIssues<EducationField>[F] } = {};
  issues.institution = textIssue(value.institution, 1, 160);
  issues.degree = textIssue(value.degree, 1, 120);
  issues.field = optionalTextIssue(value.field, 120);
  issues.yearFrom = integerIssue(value.yearFrom, MIN_YEAR, currentYear);
  issues.yearTo = integerIssue(value.yearTo, MIN_YEAR, currentYear + MAX_YEARS_AHEAD, true);

  const from = parseNumber(value.yearFrom);
  const to = parseNumber(value.yearTo);
  if (!issues.yearFrom && !issues.yearTo && from !== null && to !== null && to < from) {
    issues.yearTo = issue('tutoring.tutor.validation.yearOrder');
  }
  return compact(issues);
}

export function validateCertificate(value: CertificateFormValue, currentYear: number): FieldIssues<CertificateField> {
  return compact<CertificateField>({
    title: textIssue(value.title, 1, 160),
    issuer: optionalTextIssue(value.issuer, 160),
    year: integerIssue(value.year, MIN_YEAR, currentYear),
  });
}

/** `sortOrder` is the position the row should take; the API does not reorder on its own. */
export function educationRequest(value: EducationFormValue, sortOrder: number): UpsertEducationRequest {
  return {
    institution: value.institution.trim(),
    degree: value.degree.trim(),
    field: trimToNull(value.field),
    yearFrom: Number(value.yearFrom.trim()),
    yearTo: trimToNull(value.yearTo) === null ? null : Number(value.yearTo.trim()),
    sortOrder,
  };
}

export function certificateRequest(value: CertificateFormValue, sortOrder: number): UpsertCertificateRequest {
  return { title: value.title.trim(), issuer: trimToNull(value.issuer), year: Number(value.year.trim()), sortOrder };
}
