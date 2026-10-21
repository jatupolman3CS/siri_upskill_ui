/**
 * Administrator side of tutor moderation and the subject catalogue (P13-26). Mirrors, field for field, `AdminTutorListItem`,
 * `AdminTutorDetail`, `SuspendTutorRequest`, `ReinstateTutorRequest`, `SetCommissionRequest`, `CreateSubjectRequest`,
 * `UpdateSubjectRequest` and `AdminSubjectResponse` of `Siri.Modules.Tutoring/Application/TutoringModels.cs`, served by
 * `Siri.Api/Controllers/Tutoring/TutoringAdminController.cs`. If a C# record disagrees with a type here, the C# record wins:
 * report it, do not guess.
 *
 * Note what the API does NOT offer an administrator: there is no endpoint to list or unlist a tutor (only the tutor does
 * that - `isListed` is read-only here; suspending unlists), and no per-tutor penalty history (only the reliability score).
 */
import type { PagedResult } from '../../../../core/http/paged-result.model';
import type { Guid, IsoUtc, TutorGender } from '../../data/tutoring-public.models';
import type { TutorCertificate, TutorEducation, TutorOffering, TutorStatus } from '../../data/tutoring-tutor.models';

export type { PagedResult };

export interface AdminTutorListItem {
  readonly tutorId: Guid;
  readonly slug: string;
  readonly displayName: string;
  readonly status: TutorStatus;
  readonly isListed: boolean;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedSessionsCount: number;
  readonly reliabilityScore: number;
  /** The tutor's own commission rate in percent; `null` = the platform default applies. */
  readonly commissionPercentOverride: number | null;
  readonly verifiedAtUtc: IsoUtc | null;
  readonly statusChangedAtUtc: IsoUtc;
}

export interface AdminTutorDetail {
  readonly tutorId: Guid;
  readonly userId: Guid;
  readonly instructorProfileId: Guid;
  readonly slug: string;
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
  readonly gender: TutorGender;
  readonly yearsExperience: number;
  readonly status: TutorStatus;
  /** Why the tutor is `NeedsInfo` / `Rejected` / `Suspended`; the tutor reads the same text. */
  readonly statusReason: string | null;
  readonly isListed: boolean;
  readonly commissionPercentOverride: number | null;
  /** The rate that applies right now: the override when there is one, else the platform default. */
  readonly effectiveCommissionPercent: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedSessionsCount: number;
  readonly reliabilityScore: number;
  readonly nextAvailableAtUtc: IsoUtc | null;
  readonly verifiedAtUtc: IsoUtc | null;
  readonly statusChangedAtUtc: IsoUtc;
  readonly offerings: readonly TutorOffering[];
  readonly educations: readonly TutorEducation[];
  readonly certificates: readonly TutorCertificate[];
}

/** Query of `GET admin/tutors`; the page lives in the URL, so every field is optional. */
export interface AdminTutorQuery {
  readonly status?: TutorStatus;
  /** Display-name search (the server escapes `%`, `_` and `\`). */
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SuspendTutorRequest {
  /** 1-1000 characters; the tutor reads it. */
  readonly reason: string;
}

export interface ReinstateTutorRequest {
  readonly reason: string | null;
}

export interface SetCommissionRequest {
  /** 0-50 with at most two decimals; `null` clears the override (back to the platform default). */
  readonly commissionPercentOverride: number | null;
  /** 1-1000 characters; kept in the audit trail. */
  readonly reason: string;
}

export interface AdminSubject {
  readonly subjectId: Guid;
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  /** `null` = a top-level group; a subject sits under exactly one group (two levels at most). */
  readonly parentId: Guid | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface CreateSubjectRequest {
  /** Lower-case `a-z`, digits and `-`, at most 80 characters; part of search URLs, so it can never be changed afterwards. */
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly parentId: Guid | null;
  readonly sortOrder: number;
}

/** No `slug`: it never changes. */
export interface UpdateSubjectRequest {
  readonly nameTh: string;
  readonly nameEn: string;
  readonly parentId: Guid | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}
