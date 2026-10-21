import type { KycCaseStatus } from '../../data/tutoring-kyc.models';
import type { Guid } from '../../data/tutoring-public.models';
import type { AdminKycCaseDetail, AdminKycDocument, KycDecision, KycDocumentVerdict } from '../data/admin-kyc.models';

/** The longest decision note the API takes; the applicant reads it. */
export const KYC_NOTE_MAX = 1000;

/** The reviewer's pending choices, per document (a document missing from the map is "not decided yet"). */
export type VerdictMap = Readonly<Record<Guid, 'Approved' | 'Rejected'>>;

/** Only a `Submitted` or `InReview` case can be decided; the server says the same with `409 case_not_decidable`. */
export function isDecidable(status: KycCaseStatus): boolean {
  return status === 'Submitted' || status === 'InReview';
}

/** Documents that still need a verdict: judged by nobody yet and still stored. */
export function pendingDocuments(detail: AdminKycCaseDetail): readonly AdminKycDocument[] {
  return detail.documents.filter((document) => document.status === 'Pending' && !document.purged);
}

/** The verdicts to send: those chosen for documents that are still pending (an earlier verdict is final and not resent). */
export function verdictsToSend(detail: AdminKycCaseDetail, verdicts: VerdictMap): readonly KycDocumentVerdict[] {
  return pendingDocuments(detail)
    .filter((document) => verdicts[document.documentId] !== undefined)
    .map((document) => ({ documentId: document.documentId, status: verdicts[document.documentId] }));
}

export type KycDecisionIssue = 'noteRequired' | 'noteTooLong' | 'undecidedDocuments';

/**
 * What stops the form being sent, as far as the client can tell: a note is mandatory unless approving, and an approval needs a
 * verdict on every pending document. A convenience only - the server re-checks all of it (and also needs an approved document of
 * every required type, which it answers with `documents_undecided` + the missing `types`).
 */
export function kycDecisionIssue(decision: KycDecision, note: string, undecidedCount: number): KycDecisionIssue | null {
  const trimmed = note.trim();
  if (trimmed.length > KYC_NOTE_MAX) {
    return 'noteTooLong';
  }
  if (decision !== 'Approve' && trimmed.length === 0) {
    return 'noteRequired';
  }
  return decision === 'Approve' && undecidedCount > 0 ? 'undecidedDocuments' : null;
}

/** `1.4 MB` / `230 KB`; sizes are shown to help spot an odd file, not to the byte. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** How a fetched file is shown: from the type the SERVER decided on (the blob's), not from anything the browser guesses. */
export type PreviewKind = 'image' | 'pdf' | 'other';

export function previewKindOf(mimeType: string): PreviewKind {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  if (type === 'application/pdf') {
    return 'pdf';
  }
  return type === 'image/jpeg' || type === 'image/png' ? 'image' : 'other';
}
