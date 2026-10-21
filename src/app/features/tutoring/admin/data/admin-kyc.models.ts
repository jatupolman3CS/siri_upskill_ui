/**
 * Administrator side of the tutor identity check (P13-26). Mirrors, field for field, the records of
 * `Siri.Modules.Tutoring/Application/Kyc/KycModels.cs` (`AdminKycCaseListItem`, `AdminKycDocumentItem`, `AdminKycCaseDetail`,
 * `DecideKycCaseRequest`, `KycAccessLogItem`) and the controller `Siri.Api/Controllers/Tutoring/AdminKycController.cs`. If a C#
 * record disagrees with a type here, the C# record wins: report it, do not guess.
 *
 * The file bytes never appear in a model: the API streams them (`getDocumentContent`) and the client only ever holds a `Blob`
 * for the lifetime of the viewer.
 */
import type { PagedResult } from '../../../../core/http/paged-result.model';
import type { KycCaseStatus, KycDocumentStatus, KycDocumentType } from '../../data/tutoring-kyc.models';
import type { Guid, IsoUtc, TutorGender } from '../../data/tutoring-public.models';
import type { TutorStatus } from '../../data/tutoring-tutor.models';

export type { PagedResult };

export type KycDecision = 'Approve' | 'Reject' | 'NeedsInfo';
export type KycAccessAction = 'View' | 'Download' | 'Purge';

/** A row of the review queue (`GET admin/kyc/cases`, oldest submission first). */
export interface AdminKycCaseListItem {
  readonly caseId: Guid;
  readonly tutorId: Guid;
  readonly tutorDisplayName: string;
  readonly attemptNo: number;
  readonly status: KycCaseStatus;
  readonly submittedAtUtc: IsoUtc | null;
  readonly documentCount: number;
  /** Whole hours since submission, worked out by the server. */
  readonly waitingHours: number;
}

export interface AdminKycDocument {
  readonly documentId: Guid;
  readonly type: KycDocumentType;
  readonly status: KycDocumentStatus;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedAtUtc: IsoUtc;
  readonly expiresAtUtc: IsoUtc | null;
  /** When the stored file is scheduled for deletion (PDPA retention); `null` until the case is approved or rejected. */
  readonly purgeAfterUtc: IsoUtc | null;
  /** The file was already deleted; the row stays as a record and there is nothing to open. */
  readonly purged: boolean;
  /** Documents of OTHER tutors with the same SHA-256: a fraud signal (one file on several accounts). */
  readonly sameFileSeenFromOtherTutors: number;
}

export interface AdminKycCaseDetail {
  readonly caseId: Guid;
  readonly tutorId: Guid;
  readonly tutorDisplayName: string;
  readonly gender: TutorGender;
  readonly headline: string | null;
  readonly attemptNo: number;
  readonly status: KycCaseStatus;
  readonly submittedAtUtc: IsoUtc | null;
  readonly decidedAtUtc: IsoUtc | null;
  readonly decidedByUserId: Guid | null;
  readonly decisionNote: string | null;
  readonly consentVersion: string;
  readonly consentAtUtc: IsoUtc;
  readonly tutorStatus: TutorStatus;
  readonly requiredDocumentTypes: readonly KycDocumentType[];
  readonly documents: readonly AdminKycDocument[];
  /** Concurrency token: echo it back with the decision; a stale one answers 409. */
  readonly rowVersion: string;
}

/** The verdict on one document, sent with the decision. Only a `Pending` document can be judged. */
export interface KycDocumentVerdict {
  readonly documentId: Guid;
  readonly status: 'Approved' | 'Rejected';
}

/** `note` is mandatory for `Reject` / `NeedsInfo` (at most 1000 characters) and is shown to the applicant. */
export interface DecideKycCaseRequest {
  readonly decision: KycDecision;
  readonly note: string | null;
  readonly documents: readonly KycDocumentVerdict[];
  readonly rowVersion: string;
}

export interface KycAccessLogItem {
  readonly accessedAtUtc: IsoUtc;
  /** `null` = the system (the purge job). */
  readonly accessedByUserId: Guid | null;
  readonly action: KycAccessAction;
  readonly ipAddress: string | null;
}

export type AdminKycCasePage = PagedResult<AdminKycCaseListItem>;
export type KycAccessLogPage = PagedResult<KycAccessLogItem>;
