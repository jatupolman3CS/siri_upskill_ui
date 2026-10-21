import type { EvidenceLinkInput } from '../../../data/tutoring-dispute.models';
import { type FieldIssue, issue, optionalTextIssue, textIssue } from '../../../ui/tutor-form.util';

/**
 * Client-side validation limits and issues for tutor dispute forms.
 */
export const TUTOR_DISPUTE_LIMITS = {
  descriptionMin: 10,
  description: 2000,
  message: 2000,
  linkUrl: 500,
  linkLabel: 120,
  maxLinks: 10,
} as const;

export function tutorDisputeDescriptionIssue(value: string): FieldIssue | undefined {
  return textIssue(value, TUTOR_DISPUTE_LIMITS.descriptionMin, TUTOR_DISPUTE_LIMITS.description);
}

export function tutorDisputeMessageIssue(value: string): FieldIssue | undefined {
  return textIssue(value, 1, TUTOR_DISPUTE_LIMITS.message);
}

export interface TutorEvidenceRow {
  readonly url: string;
  readonly label: string;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal') || IPV4.test(lower) || lower.includes(':');
}

export function tutorEvidenceRowIssue(row: TutorEvidenceRow): FieldIssue | undefined {
  const url = row.url.trim();
  if (url.length === 0) {
    return row.label.trim().length > 0 ? issue('tutoring.tutor.disputes.validation.linkRequired') : undefined;
  }
  if (url.length > TUTOR_DISPUTE_LIMITS.linkUrl) {
    return issue('tutoring.tutor.validation.tooLong', { max: TUTOR_DISPUTE_LIMITS.linkUrl });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return issue('tutoring.tutor.disputes.validation.linkInvalid');
  }
  if (parsed.protocol !== 'https:') {
    return issue('tutoring.tutor.disputes.validation.linkNotHttps');
  }
  if (parsed.username !== '' || parsed.password !== '' || isPrivateHost(parsed.hostname)) {
    return issue('tutoring.tutor.disputes.validation.linkInvalid');
  }
  return optionalTextIssue(row.label, TUTOR_DISPUTE_LIMITS.linkLabel);
}

export function tutorEvidenceInputs(rows: readonly TutorEvidenceRow[]): readonly EvidenceLinkInput[] | null {
  const filled = rows.filter((row) => row.url.trim().length > 0);
  return filled.length === 0 ? null : filled.map((row) => ({ url: row.url.trim(), label: row.label.trim().length > 0 ? row.label.trim() : null }));
}

export function tutorFirstEvidenceIssue(rows: readonly TutorEvidenceRow[]): { readonly index: number; readonly issue: FieldIssue } | undefined {
  for (let index = 0; index < rows.length; index++) {
    const found = tutorEvidenceRowIssue(rows[index]);
    if (found !== undefined) {
      return { index, issue: found };
    }
  }
  return undefined;
}
