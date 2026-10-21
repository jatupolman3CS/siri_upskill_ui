/**
 * Tutor Portal DTOs (P13-01) - mirror, field for field, the C# records of `Siri.Modules.Tutoring/Application/TutoringModels.cs`
 * and the "Frontend DTO appendix" of `siri_upskill_backend/docs/contracts/P13-01-tutoring-module-and-tutor-profile.md`
 * (the tutor-facing half; the admin records belong to P13-26). If a C# record disagrees with a type here, the C# record
 * wins: report it, do not guess.
 *
 * Nothing here is a decision: the server owns the verification state machine, the readiness blockers and every rule on
 * rates and trials. The client only displays what it is told and mirrors the documented limits as a convenience.
 */
import type { PagedResult } from '../../../core/http/paged-result.model';
import type { Guid, IsoUtc, TutorCurriculum, TutorGender, TutorLevel } from './tutoring-public.models';

export type { Guid, IsoUtc, PagedResult };

export type TutorStatus = 'Draft' | 'PendingVerification' | 'NeedsInfo' | 'Verified' | 'Rejected' | 'Suspended';

/**
 * What stands between the tutor and "submit for verification". `blockers` are stable snake_case codes (the C# record
 * documents `display_name_missing`, `headline_missing`, `bio_too_short`, `no_active_offering`, `photo_missing` and the
 * `kyc_*` codes P13-02 adds) that map to `tutoring.tutor.readiness.<code>`; unknown codes must degrade gracefully.
 */
export interface TutorReadiness {
  readonly canSubmitForVerification: boolean;
  readonly blockers: readonly string[];
}

/** The tutor's own view of their profile (`GET /api/tutoring/tutor/profile`). No user id, commission or rating data. */
export interface TutorProfile {
  readonly tutorId: Guid;
  readonly slug: string;
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
  readonly gender: TutorGender;
  readonly yearsExperience: number;
  readonly status: TutorStatus;
  /** Why the profile is `NeedsInfo` / `Rejected` / `Suspended` - written by an admin, shown to the tutor. */
  readonly statusReason: string | null;
  readonly isListed: boolean;
  /** Short-lived signed URL, rebuilt on every read; never store it. */
  readonly photoUrl: string | null;
  readonly introVideoAssetId: Guid | null;
  readonly minNoticeHours: number;
  readonly bufferMinutes: number;
  readonly maxAdvanceDays: number;
  readonly verifiedAtUtc: IsoUtc | null;
  readonly readiness: TutorReadiness;
  /**
   * The class lengths (minutes) the platform accepts - `Tutoring:Slots:AllowedDurationsMinutes`, ascending, never empty and never `null`.
   * What a tutor may choose from when building a package; the same list the public page of a Verified tutor carries.
   */
  readonly allowedDurationMinutes: readonly number[];
  /** Base64 concurrency token: send back the value from the last read on every write. */
  readonly rowVersion: string;
}

export interface CreateTutorProfileRequest {
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
  readonly gender: TutorGender;
  readonly yearsExperience: number;
}

export interface UpdateTutorProfileRequest extends CreateTutorProfileRequest {
  readonly rowVersion: string;
}

export interface SetListingRequest {
  readonly isListed: boolean;
  readonly rowVersion: string;
}

export interface SetIntroVideoRequest {
  readonly mediaAssetId: Guid;
}

export interface PhotoUploadResponse {
  readonly photoUrl: string;
}

// --- Offerings ---------------------------------------------------------------------------------------------------------

export interface OfferingSubjectRef {
  readonly subjectId: Guid;
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
}

export interface UpsertOfferingRequest {
  readonly subjectId: Guid;
  readonly level: TutorLevel;
  readonly curriculum: TutorCurriculum;
  readonly hourlyRateOneOnOne: number;
  readonly groupHourlyRatePerSeat: number | null;
  readonly groupMaxSeats: number | null;
  readonly trialEnabled: boolean;
  /** 15 or 30; `null` whenever `trialEnabled` is false. */
  readonly trialMinutes: number | null;
  /** Full price of the trial (not per hour); `0` = free; `null` whenever `trialEnabled` is false. */
  readonly trialPrice: number | null;
  readonly isActive: boolean;
}

export interface TutorOffering extends Omit<UpsertOfferingRequest, 'subjectId'> {
  readonly offeringId: Guid;
  readonly subject: OfferingSubjectRef;
}

// --- Education & certificates ------------------------------------------------------------------------------------------

export interface UpsertEducationRequest {
  readonly institution: string;
  readonly degree: string;
  readonly field: string | null;
  readonly yearFrom: number;
  /** `null` = still studying. */
  readonly yearTo: number | null;
  readonly sortOrder: number;
}

export interface TutorEducation extends UpsertEducationRequest {
  readonly educationId: Guid;
}

export interface UpsertCertificateRequest {
  readonly title: string;
  readonly issuer: string | null;
  readonly year: number;
  readonly sortOrder: number;
}

export interface TutorCertificate extends UpsertCertificateRequest {
  readonly certificateId: Guid;
}
