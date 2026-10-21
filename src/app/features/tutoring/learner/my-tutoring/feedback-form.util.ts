import type { EvidenceLinkInput } from '../../data/tutoring-dispute.models';
import { type FieldIssue, issue, optionalTextIssue, textIssue } from '../../ui/tutor-form.util';

/**
 * Client-side checks of the review and dispute forms. A convenience only (the person learns about a slip before the round trip);
 * the server re-validates every rule and its answer wins - it also refuses contact details, meeting-room links and every other
 * rule that depends on its configuration, which are NOT mirrored here.
 */
export const REVIEW_LIMITS = { comment: 1000 } as const;
export const DISPUTE_LIMITS = {
  descriptionMin: 10,
  description: 2000,
  message: 2000,
  linkUrl: 500,
  linkLabel: 120,
  maxLinks: 10,
} as const;

export function reviewCommentIssue(value: string): FieldIssue | undefined {
  return optionalTextIssue(value, REVIEW_LIMITS.comment);
}

export function disputeDescriptionIssue(value: string): FieldIssue | undefined {
  return textIssue(value, DISPUTE_LIMITS.descriptionMin, DISPUTE_LIMITS.description);
}

export function disputeMessageIssue(value: string): FieldIssue | undefined {
  return textIssue(value, 1, DISPUTE_LIMITS.message);
}

/** One row of the evidence-link editor: an address (and an optional label). A row with neither is simply ignored. */
export interface EvidenceRow {
  readonly url: string;
  readonly label: string;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Hosts the server refuses outright; checking them here only saves a round trip. */
function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal') || IPV4.test(lower) || lower.includes(':');
}

/** Why `row` cannot be sent, or `undefined` when it is fine (or empty). Evidence is an https link with a normal public host. */
export function evidenceRowIssue(row: EvidenceRow): FieldIssue | undefined {
  const url = row.url.trim();
  if (url.length === 0) {
    return row.label.trim().length > 0 ? issue('tutoring.dispute.validation.linkRequired') : undefined;
  }
  if (url.length > DISPUTE_LIMITS.linkUrl) {
    return issue('tutoring.tutor.validation.tooLong', { max: DISPUTE_LIMITS.linkUrl });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return issue('tutoring.dispute.validation.linkInvalid');
  }
  if (parsed.protocol !== 'https:') {
    return issue('tutoring.dispute.validation.linkNotHttps');
  }
  if (parsed.username !== '' || parsed.password !== '' || isPrivateHost(parsed.hostname)) {
    return issue('tutoring.dispute.validation.linkInvalid');
  }
  return optionalTextIssue(row.label, DISPUTE_LIMITS.linkLabel);
}

/** The request form of the filled rows (`null` when there are none), trimmed; an empty label is sent as `null`. */
export function evidenceInputs(rows: readonly EvidenceRow[]): readonly EvidenceLinkInput[] | null {
  const filled = rows.filter((row) => row.url.trim().length > 0);
  return filled.length === 0 ? null : filled.map((row) => ({ url: row.url.trim(), label: row.label.trim().length > 0 ? row.label.trim() : null }));
}

/** The first row that cannot be sent, as `{ index, issue }`, or `undefined`. */
export function firstEvidenceIssue(rows: readonly EvidenceRow[]): { readonly index: number; readonly issue: FieldIssue } | undefined {
  for (let index = 0; index < rows.length; index++) {
    const found = evidenceRowIssue(rows[index]);
    if (found !== undefined) {
      return { index, issue: found };
    }
  }
  return undefined;
}

/** The host of an evidence address, shown before the link is followed; the address itself when it does not parse. */
export function hostOfUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
