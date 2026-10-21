import { isHttpsUrl } from '../../live/data/live-instructor.util';
import type { AddMaterialRequest, CompleteClassRequest, Guid, TutorSummaryResponse } from '../data/tutoring-classes.models';
import { type FieldIssue, type FieldIssues, issue, optionalTextIssue, textIssue, trimToNull } from '../ui/tutor-form.util';

/**
 * Pure form logic of the class screen (P13-25): lesson summary, cancellation reason, meeting link and materials. Like every
 * tutor form util this is a convenience - the structural limits of the contract (lengths, "required") are mirrored so a mistake
 * is shown before the round trip; the server re-validates all of it, scrubs room links out of the texts and its answer wins.
 */

export const SUMMARY_LIMITS = { topics: 2000, homework: 2000, nextSteps: 2000, feedback: 2000, maxFeedbackLearners: 6 } as const;
export const CANCEL_REASON_LIMITS = { min: 3, max: 500 } as const;
export const MATERIAL_LIMITS = { title: 200, url: 500, body: 4000 } as const;

// --- Summary ----------------------------------------------------------------------------------------------------------------

export type SummaryField = 'topicsCovered' | 'homework' | 'nextSteps';

export interface SummaryFormValue {
  readonly topicsCovered: string;
  readonly homework: string;
  readonly nextSteps: string;
  /** Feedback text per booking id (empty = none for that learner). */
  readonly feedback: Readonly<Record<Guid, string>>;
}

export interface SummaryIssues {
  readonly fields: FieldIssues<SummaryField>;
  /** Problems with a learner's feedback, by booking id. */
  readonly feedback: Readonly<Record<Guid, FieldIssue>>;
  /** Too many learners given feedback at once (more than the contract's six). */
  readonly tooManyFeedbacks: boolean;
}

export function emptySummaryForm(): SummaryFormValue {
  return { topicsCovered: '', homework: '', nextSteps: '', feedback: {} };
}

/** Fills the form from a stored summary so a tutor can correct it within the edit window. */
export function summaryToForm(summary: TutorSummaryResponse): SummaryFormValue {
  return {
    topicsCovered: summary.topicsCovered ?? '',
    homework: summary.homework ?? '',
    nextSteps: summary.nextSteps ?? '',
    feedback: Object.fromEntries(summary.learners.map((learner) => [learner.bookingId, learner.feedback ?? ''])),
  };
}

export function validateSummary(value: SummaryFormValue): SummaryIssues {
  const fields: FieldIssues<SummaryField> = {};
  const topics = textIssue(value.topicsCovered, 1, SUMMARY_LIMITS.topics, { allowMarkup: true });
  if (topics) {
    fields.topicsCovered = topics;
  }
  const homework = longTextIssue(value.homework, SUMMARY_LIMITS.homework);
  if (homework) {
    fields.homework = homework;
  }
  const nextSteps = longTextIssue(value.nextSteps, SUMMARY_LIMITS.nextSteps);
  if (nextSteps) {
    fields.nextSteps = nextSteps;
  }

  const feedback: Record<Guid, FieldIssue> = {};
  let filled = 0;
  for (const [bookingId, text] of Object.entries(value.feedback)) {
    if (text.trim().length > 0) {
      filled++;
    }
    const problem = longTextIssue(text, SUMMARY_LIMITS.feedback);
    if (problem) {
      feedback[bookingId] = problem;
    }
  }
  return { fields, feedback, tooManyFeedbacks: filled > SUMMARY_LIMITS.maxFeedbackLearners };
}

export function hasSummaryIssues(issues: SummaryIssues): boolean {
  return Object.keys(issues.fields).length > 0 || Object.keys(issues.feedback).length > 0 || issues.tooManyFeedbacks;
}

/** Optional plain text: empty is fine, otherwise at most `max` characters (markup is the server's to judge). */
function longTextIssue(value: string, max: number): FieldIssue | undefined {
  return value.length > max ? issue('tutoring.tutor.validation.tooLong', { max }) : undefined;
}

export function summaryRequest(value: SummaryFormValue): CompleteClassRequest {
  return {
    topicsCovered: value.topicsCovered.trim(),
    homework: trimToNull(value.homework),
    nextSteps: trimToNull(value.nextSteps),
    learnerFeedback: Object.entries(value.feedback)
      .map(([bookingId, feedback]) => ({ bookingId, feedback: feedback.trim() }))
      .filter((entry) => entry.feedback.length > 0),
  };
}

// --- Cancellation reason ------------------------------------------------------------------------------------------------------

export function cancelReasonIssue(reason: string): FieldIssue | undefined {
  return textIssue(reason, CANCEL_REASON_LIMITS.min, CANCEL_REASON_LIMITS.max, { allowMarkup: true });
}

// --- Meeting link -------------------------------------------------------------------------------------------------------------

export function meetingLinkIssue(value: string): FieldIssue | undefined {
  const text = value.trim();
  if (text.length === 0) {
    return issue('tutoring.tutor.validation.required');
  }
  return isHttpsUrl(text) ? undefined : issue('tutoring.tutor.classes.room.linkInvalid');
}

// --- Materials ---------------------------------------------------------------------------------------------------------------

export type MaterialField = 'title' | 'url' | 'bodyText';
export type MaterialChoice = 'Link' | 'Homework';

export interface MaterialFormValue {
  readonly kind: MaterialChoice;
  readonly title: string;
  readonly url: string;
  readonly bodyText: string;
}

export function emptyMaterialForm(kind: MaterialChoice = 'Link'): MaterialFormValue {
  return { kind, title: '', url: '', bodyText: '' };
}

export function validateMaterial(value: MaterialFormValue): FieldIssues<MaterialField> {
  const issues: FieldIssues<MaterialField> = {};
  const title = textIssue(value.title, 1, MATERIAL_LIMITS.title, { allowMarkup: true });
  if (title) {
    issues.title = title;
  }
  const url = value.url.trim();
  const body = value.bodyText.trim();
  if (value.kind === 'Link') {
    if (url.length === 0) {
      issues.url = issue('tutoring.tutor.validation.required');
    }
  } else if (url.length === 0 && body.length === 0) {
    // A homework item needs something to do: a text, a link, or both.
    issues.bodyText = issue('tutoring.tutor.classes.materials.homeworkNeedsContent');
  }
  if (url.length > 0 && (url.length > MATERIAL_LIMITS.url || !isHttpsUrl(url))) {
    issues.url = issue(url.length > MATERIAL_LIMITS.url ? 'tutoring.tutor.validation.tooLong' : 'tutoring.tutor.classes.materials.urlInvalid', {
      max: MATERIAL_LIMITS.url,
    });
  }
  const bodyIssue = optionalTextIssue(value.bodyText, MATERIAL_LIMITS.body);
  if (value.kind === 'Homework' && bodyIssue) {
    issues.bodyText = bodyIssue;
  }
  return issues;
}

export function materialRequest(value: MaterialFormValue): AddMaterialRequest {
  return {
    kind: value.kind,
    title: value.title.trim(),
    url: trimToNull(value.url),
    bodyText: value.kind === 'Homework' ? trimToNull(value.bodyText) : null,
  };
}
