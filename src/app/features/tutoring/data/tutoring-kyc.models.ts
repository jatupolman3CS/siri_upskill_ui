/**
 * Tutor identity-verification (KYC) DTOs, tutor-facing half of `siri_upskill_backend/docs/contracts/P13-02-tutor-kyc-documents.md`
 * and `Siri.Modules.Tutoring/Application/Kyc/KycModels.cs`. If a C# record disagrees with a type here, the C# record wins:
 * report it, do not guess.
 *
 * What is deliberately absent: the API never returns a storage key, a hash, a size, a file name or any URL for a document -
 * a tutor can upload a file but can never read it back, so there is nothing here that could locate one. The administrator
 * half (review queue, document viewer, decision) is P13-26.
 */
import type { Guid, IsoUtc } from './tutoring-public.models';

export type KycCaseStatus = 'Draft' | 'Submitted' | 'InReview' | 'NeedsInfo' | 'Approved' | 'Rejected';
export type KycDocumentType = 'IdCard' | 'Diploma' | 'CriminalRecord' | 'Certificate' | 'Other';
export type KycDocumentStatus = 'Pending' | 'Approved' | 'Rejected';

/** A tutor's view of one uploaded document: what it is and how it was judged, never what it looks like. */
export interface KycDocument {
  readonly documentId: Guid;
  readonly type: KycDocumentType;
  readonly status: KycDocumentStatus;
  readonly uploadedAtUtc: IsoUtc;
  readonly expiresAtUtc: IsoUtc | null;
  /** The file was deleted after its retention period; the row stays as a record. */
  readonly purged: boolean;
}

export interface KycCase {
  readonly caseId: Guid;
  readonly attemptNo: number;
  readonly status: KycCaseStatus;
  readonly submittedAtUtc: IsoUtc | null;
  readonly decidedAtUtc: IsoUtc | null;
  /** The reviewer's message to the applicant (shown for `NeedsInfo` / `Rejected`). */
  readonly decisionNote: string | null;
  readonly consentVersion: string;
  readonly documents: readonly KycDocument[];
}

/** `GET /api/tutoring/tutor/kyc` - everything the onboarding screen needs. */
export interface TutorKycStatus {
  readonly enabled: boolean;
  /** Version of the PDPA consent text the tutor must accept to start a case. */
  readonly consentVersion: string;
  readonly requiredDocumentTypes: readonly KycDocumentType[];
  readonly currentCase: KycCase | null;
  readonly history: readonly KycCase[];
  readonly canStartNewCase: boolean;
  readonly maxFileBytes: number;
  /** Lower-case extensions with the dot, e.g. `.pdf`. */
  readonly allowedExtensions: readonly string[];
}

export interface CreateKycCaseRequest {
  readonly consentVersion: string;
}

/** Progress, then the stored document, of one upload (`POST .../cases/{caseId}/documents`). */
export type KycUploadEvent =
  | { readonly type: 'progress'; readonly percent: number }
  | { readonly type: 'done'; readonly document: KycDocument };
