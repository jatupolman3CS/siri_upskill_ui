/**
 * Public Tutor Marketplace DTOs (P13) - mirror, field for field, the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-04-tutor-search-and-public-profile.md` (search, public profile, subjects,
 * intro video) and `P13-03-tutor-availability-and-slots.md` (the public slots endpoint). If a C# record disagrees with a
 * type here, the C# record wins: report it, do not guess.
 *
 * Everything the server decides stays server-side: ratings, "verified", prices and quotes, which slots exist. The client
 * only displays these values and never recomputes them.
 */
import type { PagedResult } from '../../../core/http/paged-result.model';
import type { Guid, IsoUtc } from '../../live/data/live.models';

export type { Guid, IsoUtc };

export type TutorGender = 'Male' | 'Female' | 'Other' | 'Undisclosed';
export type TutorLevel = 'Primary' | 'LowerSecondary' | 'UpperSecondary' | 'University' | 'Competitive' | 'Adult';
export type TutorCurriculum = 'Thai' | 'EP' | 'International';
export type SessionFormat = 'OneOnOne' | 'Group';
export type TutorSort = 'relevance' | 'rating' | 'priceAsc' | 'priceDesc' | 'nextAvailable' | 'newest';

/** `0` = Sunday ... `6` = Saturday (same base as .NET `DayOfWeek` and JS `Date.getDay()`; P13-03 §2.1). */
export type DayOfWeekIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// --- Search (P13-04 §4.1 / §5.1) --------------------------------------------------------------------------------------

/** Query string of `GET /api/tutoring/tutors`. Also the shape of the `/tutors` page URL (one source of truth). */
export interface TutorSearchQuery {
  readonly q?: string;
  /** Slug of a subject OR of a subject group (a group includes all of its active children). */
  readonly subject?: string;
  readonly level?: TutorLevel;
  readonly curriculum?: TutorCurriculum;
  readonly format?: SessionFormat;
  /** Baht per hour, applied to the rate of `format` (group = per seat, otherwise one-on-one). */
  readonly priceMin?: number;
  readonly priceMax?: number;
  readonly gender?: TutorGender;
  /** `day`, `from` and `to` are all-or-nothing on the server (a partial set is a 400). */
  readonly day?: DayOfWeekIndex;
  /** `HH:mm`, Asia/Bangkok wall clock. */
  readonly from?: string;
  readonly to?: string;
  readonly sort?: TutorSort;
  readonly page?: number;
  readonly pageSize?: number;
  /** Default true on the server; pass `false` to skip the facet queries on pages 2+. */
  readonly facets?: boolean;
}

export interface TutorSearchSubject {
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
}

export interface TutorSearchItem {
  readonly slug: string;
  readonly displayName: string;
  readonly headline: string | null;
  /** API-relative path (`/api/tutoring/tutors/{slug}/photo?v=...`), not a storage URL - resolve with `mediaUrl`. */
  readonly photoUrl: string | null;
  readonly gender: TutorGender;
  readonly yearsExperience: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedSessionsCount: number;
  readonly subjects: readonly TutorSearchSubject[];
  readonly levels: readonly TutorLevel[];
  readonly curricula: readonly TutorCurriculum[];
  readonly fromHourlyRate: number;
  readonly hasGroup: boolean;
  readonly hasTrial: boolean;
  readonly hasFreeTrial: boolean;
  readonly nextAvailableAtUtc: IsoUtc | null;
}

export interface SubjectFacet extends TutorSearchSubject {
  readonly parentSlug: string | null;
  readonly count: number;
}

export interface LevelFacet {
  readonly level: TutorLevel;
  readonly count: number;
}

export interface CurriculumFacet {
  readonly curriculum: TutorCurriculum;
  readonly count: number;
}

export interface GenderFacet {
  readonly gender: TutorGender;
  readonly count: number;
}

export interface FormatFacet {
  readonly format: SessionFormat;
  readonly count: number;
}

export interface HourlyRateRange {
  readonly min: number;
  readonly max: number;
}

export interface TutorSearchFacets {
  readonly subjects: readonly SubjectFacet[];
  readonly levels: readonly LevelFacet[];
  readonly curricula: readonly CurriculumFacet[];
  readonly genders: readonly GenderFacet[];
  readonly formats: readonly FormatFacet[];
  readonly trialCount: number;
  readonly hourlyRate: HourlyRateRange | null;
}

export interface TutorSearchResponse {
  readonly results: PagedResult<TutorSearchItem>;
  /** `null` when the request asked for `facets=false`. */
  readonly facets: TutorSearchFacets | null;
}

// --- Subjects (P13-04 §5) ---------------------------------------------------------------------------------------------

/**
 * One row of `GET /api/tutoring/subjects` (C# record `PublicSubjectItem`, contract revision 3). `subjectId` is the id a tutor sends when adding
 * an offering (a subject is public data, so its id is not sensitive). A row with `parentSlug: null` is a top-level group - and, like every row,
 * can itself be chosen as an offering's subject; the rest sit under the group `parentSlug` names.
 */
export interface PublicSubjectItem {
  readonly subjectId: Guid;
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly parentSlug: string | null;
  readonly sortOrder: number;
}

// --- Public profile (P13-04 §5.1) -------------------------------------------------------------------------------------

export interface TutorIntroVideoInfo {
  readonly durationSeconds: number;
  /** API-relative, WITHOUT the `/api` prefix: `"/tutoring/tutors/{slug}/intro-video"` (C# `TutorIntroVideoInfo`; the client builds the request from the slug). */
  readonly playbackPath: string;
}

/** `GET /api/tutoring/tutors/{slug}/intro-video` (200, `Cache-Control: no-store`). */
export interface IntroVideoPlayback {
  readonly manifestUrl: string;
  readonly expiresAtUtc: IsoUtc;
}

export interface PublicTrial {
  readonly minutes: 15 | 30;
  readonly price: number;
  readonly isFree: boolean;
}

export interface PublicOffering {
  readonly offeringId: Guid;
  readonly subject: TutorSearchSubject;
  readonly level: TutorLevel;
  readonly curriculum: TutorCurriculum;
  readonly hourlyRateOneOnOne: number;
  readonly groupHourlyRatePerSeat: number | null;
  readonly groupMaxSeats: number | null;
  readonly trial: PublicTrial | null;
}

export interface PublicEducation {
  readonly institution: string;
  readonly degree: string;
  readonly field: string | null;
  readonly yearFrom: number;
  readonly yearTo: number | null;
}

export interface PublicCertificate {
  readonly title: string;
  readonly issuer: string | null;
  readonly year: number;
}

export interface TutorPublicProfile {
  readonly slug: string;
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
  readonly photoUrl: string | null;
  readonly introVideo: TutorIntroVideoInfo | null;
  readonly gender: TutorGender;
  readonly yearsExperience: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedSessionsCount: number;
  readonly verified: boolean;
  readonly verifiedAtUtc: IsoUtc | null;
  readonly minNoticeHours: number;
  readonly maxAdvanceDays: number;
  readonly nextAvailableAtUtc: IsoUtc | null;
  readonly timezone: 'Asia/Bangkok';
  /**
   * The lesson lengths (minutes) this deployment accepts, ascending (server option `Tutoring:Slots:AllowedDurationsMinutes`). The booking
   * screens offer exactly these; a length outside the list is refused with `400 tutoring.duration_not_allowed`.
   */
  readonly allowedDurationMinutes: readonly number[];
  readonly offerings: readonly PublicOffering[];
  readonly educations: readonly PublicEducation[];
  readonly certificates: readonly PublicCertificate[];
}

// --- Slots (P13-03 §6.2-6.3) ------------------------------------------------------------------------------------------

/** Query string of `GET /api/tutoring/tutors/{slug}/slots`. */
export interface TutorSlotsQuery {
  readonly offeringId: Guid;
  /** ISO-8601 UTC; defaults to "now" on the server. */
  readonly from?: IsoUtc;
  /** ISO-8601 UTC; the range may not exceed 31 days. */
  readonly to?: IsoUtc;
  readonly durationMinutes?: number;
  /** Server default `OneOnOne`. */
  readonly format?: SessionFormat;
  /** Server default `false`; `true` forces the offering's trial length and price. */
  readonly trial?: boolean;
}

export interface TutorSlot {
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  /** `1` for one-on-one; remaining seats for a group slot. */
  readonly seatsLeft: number;
  /** `true` = this slot joins a group that is already open (rather than starting a new one). */
  readonly joinsExistingGroup: boolean;
}

/** Display price computed by the server's `TutorPriceCalculator`. Never multiply or round it again on the client. */
export interface TutorQuote {
  readonly amount: number;
  readonly currency: 'THB';
  readonly durationMinutes: number;
  readonly hourlyRate: number | null;
  readonly isFree: boolean;
}

export interface TutorSlotsResponse {
  readonly tutorSlug: string;
  readonly offeringId: Guid;
  readonly format: SessionFormat;
  readonly durationMinutes: number;
  readonly isTrial: boolean;
  readonly quote: TutorQuote;
  readonly timezone: 'Asia/Bangkok';
  readonly serverTimeUtc: IsoUtc;
  readonly fromUtc: IsoUtc;
  readonly toUtc: IsoUtc;
  readonly minNoticeHours: number;
  readonly maxAdvanceDays: number;
  readonly slots: readonly TutorSlot[];
}
