import {
  CANCEL_REASON_LIMITS,
  type MaterialFormValue,
  SUMMARY_LIMITS,
  cancelReasonIssue,
  emptyMaterialForm,
  emptySummaryForm,
  hasSummaryIssues,
  materialRequest,
  meetingLinkIssue,
  summaryRequest,
  summaryToForm,
  validateMaterial,
  validateSummary,
} from './tutor-class-form.util';

describe('lesson summary form', () => {
  it('needs only what was covered', () => {
    expect(hasSummaryIssues(validateSummary(emptySummaryForm()))).toBe(true);
    expect(validateSummary(emptySummaryForm()).fields.topicsCovered?.key).toBe('tutoring.tutor.validation.required');
    expect(hasSummaryIssues(validateSummary({ ...emptySummaryForm(), topicsCovered: 'Quadratics' }))).toBe(false);
  });

  it('refuses a text over 2000 characters in any field, including a learner\'s feedback', () => {
    const long = 'x'.repeat(SUMMARY_LIMITS.topics + 1);
    const issues = validateSummary({ topicsCovered: long, homework: long, nextSteps: long, feedback: { 'b-1': long, 'b-2': 'fine' } });
    expect(Object.keys(issues.fields).sort()).toEqual(['homework', 'nextSteps', 'topicsCovered']);
    expect(Object.keys(issues.feedback)).toEqual(['b-1']);
  });

  it('refuses feedback for more than six learners', () => {
    const feedback = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`b-${index}`, 'ok']));
    expect(validateSummary({ ...emptySummaryForm(), topicsCovered: 'x', feedback }).tooManyFeedbacks).toBe(true);
    expect(validateSummary({ ...emptySummaryForm(), topicsCovered: 'x', feedback: { ...feedback, 'b-6': '' } }).tooManyFeedbacks).toBe(false);
  });

  it('sends optional texts as null and only the feedback that was written', () => {
    expect(
      summaryRequest({ topicsCovered: '  Quadratics ', homework: '  ', nextSteps: 'Review', feedback: { 'b-1': ' Good ', 'b-2': '  ' } }),
    ).toEqual({ topicsCovered: 'Quadratics', homework: null, nextSteps: 'Review', learnerFeedback: [{ bookingId: 'b-1', feedback: 'Good' }] });
  });

  it('fills the form from a stored summary, an absent text as empty', () => {
    expect(
      summaryToForm({ sessionId: 's', topicsCovered: 'A', homework: null, nextSteps: 'B', learners: [{ bookingId: 'b-1', nickname: 'Nok', feedback: null }] }),
    ).toEqual({ topicsCovered: 'A', homework: '', nextSteps: 'B', feedback: { 'b-1': '' } });
  });
});

describe('cancellation reason', () => {
  it('needs 3 to 500 characters', () => {
    expect(cancelReasonIssue('')?.key).toBe('tutoring.tutor.validation.required');
    expect(cancelReasonIssue('ab')?.key).toBe('tutoring.tutor.validation.tooShort');
    expect(cancelReasonIssue('abc')).toBeUndefined();
    expect(cancelReasonIssue('x'.repeat(CANCEL_REASON_LIMITS.max))).toBeUndefined();
    expect(cancelReasonIssue('x'.repeat(CANCEL_REASON_LIMITS.max + 1))?.key).toBe('tutoring.tutor.validation.tooLong');
  });
});

describe('meeting link', () => {
  it('needs an https address', () => {
    expect(meetingLinkIssue('')?.key).toBe('tutoring.tutor.validation.required');
    expect(meetingLinkIssue('http://meet.google.com/abc')?.key).toBe('tutoring.tutor.classes.room.linkInvalid');
    expect(meetingLinkIssue('not a link')?.key).toBe('tutoring.tutor.classes.room.linkInvalid');
    expect(meetingLinkIssue(' https://meet.google.com/abc-defg-hij ')).toBeUndefined();
  });
});

describe('material form', () => {
  const link: MaterialFormValue = { kind: 'Link', title: 'Worksheet', url: 'https://example.com/w.pdf', bodyText: '' };

  it('needs a title and, for a link, an https address', () => {
    expect(validateMaterial(link)).toEqual({});
    expect(validateMaterial({ ...link, title: '' }).title?.key).toBe('tutoring.tutor.validation.required');
    expect(validateMaterial({ ...link, url: '' }).url?.key).toBe('tutoring.tutor.validation.required');
    expect(validateMaterial({ ...link, url: 'http://example.com' }).url?.key).toBe('tutoring.tutor.classes.materials.urlInvalid');
    expect(validateMaterial({ ...link, url: `https://example.com/${'a'.repeat(500)}` }).url?.key).toBe('tutoring.tutor.validation.tooLong');
  });

  it('lets homework be a text, a link or both - but not nothing', () => {
    const homework: MaterialFormValue = { ...emptyMaterialForm('Homework'), title: 'Exercise 4' };
    expect(validateMaterial(homework).bodyText?.key).toBe('tutoring.tutor.classes.materials.homeworkNeedsContent');
    expect(validateMaterial({ ...homework, bodyText: 'Do 1-10' })).toEqual({});
    expect(validateMaterial({ ...homework, url: 'https://example.com/ex4' })).toEqual({});
  });

  it('builds the request: a link carries no body, empty fields become null', () => {
    expect(materialRequest({ ...link, bodyText: 'ignored for a link' })).toEqual({ kind: 'Link', title: 'Worksheet', url: 'https://example.com/w.pdf', bodyText: null });
    expect(materialRequest({ kind: 'Homework', title: ' Ex 4 ', url: '', bodyText: ' Do 1-10 ' })).toEqual({ kind: 'Homework', title: 'Ex 4', url: null, bodyText: 'Do 1-10' });
  });
});
