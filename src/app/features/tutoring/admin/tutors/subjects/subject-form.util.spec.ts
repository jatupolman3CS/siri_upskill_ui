import { slugIssue, sortOrderIssue, subjectNameIssue } from './subject-form.util';

describe('subject form checks', () => {
  it('accepts a kebab-case slug of lower-case letters and digits', () => {
    for (const slug of ['maths', 'primary-school-maths', 'a1', 'ielts-7']) {
      expect(slugIssue(slug)).toBeUndefined();
    }
  });

  it('refuses what the API refuses: upper case, spaces, underscores, doubled or edge hyphens, over 80 characters', () => {
    for (const slug of ['Maths', 'two words', 'snake_case', '-lead', 'trail-', 'double--hyphen', 'ภาษาไทย', 'x'.repeat(81)]) {
      expect(slugIssue(slug)?.key, slug).toBe('tutoring.admin.subjects.validation.slug');
    }
    expect(slugIssue('')?.key).toBe('tutoring.tutor.validation.required');
    expect(slugIssue('x'.repeat(80))).toBeUndefined();
  });

  it('requires a name and caps it at 120 characters', () => {
    expect(subjectNameIssue('  ')?.key).toBe('tutoring.tutor.validation.required');
    expect(subjectNameIssue('x'.repeat(120))).toBeUndefined();
    expect(subjectNameIssue('x'.repeat(121))).toEqual({ key: 'tutoring.tutor.validation.tooLong', params: { max: 120 } });
  });

  it('takes a whole, non-negative sort order', () => {
    expect(sortOrderIssue('0')).toBeUndefined();
    expect(sortOrderIssue('25')).toBeUndefined();
    expect(sortOrderIssue('')?.key).toBe('tutoring.tutor.validation.required');
    expect(sortOrderIssue('1.5')?.key).toBe('tutoring.tutor.validation.wholeNumber');
    expect(sortOrderIssue('-1')?.key).toBe('tutoring.tutor.validation.outOfRange');
  });
});
