import { type FieldIssue, integerIssue, issue } from '../../../ui/tutor-form.util';

export const SUBJECT_SLUG_MAX = 80;
export const SUBJECT_NAME_MAX = 120;
/** Mirrors `SUBJECT.SlugPattern`: lower-case a-z / 0-9 words joined by single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Required and well-formed; the slug is part of search URLs and cannot be changed after the subject is created. */
export function slugIssue(value: string): FieldIssue | undefined {
  const slug = value.trim();
  if (slug.length === 0) {
    return issue('tutoring.tutor.validation.required');
  }
  return slug.length > SUBJECT_SLUG_MAX || !SLUG_PATTERN.test(slug) ? issue('tutoring.admin.subjects.validation.slug', { max: SUBJECT_SLUG_MAX }) : undefined;
}

export function subjectNameIssue(value: string): FieldIssue | undefined {
  const name = value.trim();
  if (name.length === 0) {
    return issue('tutoring.tutor.validation.required');
  }
  return name.length > SUBJECT_NAME_MAX ? issue('tutoring.tutor.validation.tooLong', { max: SUBJECT_NAME_MAX }) : undefined;
}

export const SORT_ORDER_MAX = 100000;

export function sortOrderIssue(raw: string): FieldIssue | undefined {
  return integerIssue(raw, 0, SORT_ORDER_MAX);
}
