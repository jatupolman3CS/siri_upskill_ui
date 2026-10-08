import { PagedResult } from '../../../core/http/paged-result.model';
import type { DeliveryFormat, IsoUtc, LiveDisplayState } from '../../live/data/live.models';

/** Mirrors `Siri.Modules.Catalog.Domain.CourseLevel` — string-backed enum, serialized as its member
 * name (global `JsonStringEnumConverter`, `Program.cs`). */
export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'AllLevels';

/** Mirrors `Siri.Modules.Catalog.Domain.CourseLanguage`. */
export type CourseLanguage = 'Thai' | 'English';

/** Mirrors `Siri.Modules.Catalog.Features.SearchCourses.CourseSearchSort`. */
export type CourseSearchSort = 'Relevance' | 'Newest' | 'PriceAsc' | 'PriceDesc' | 'RatingDesc';

/** Mirrors `SearchCoursesQuery` (bound from individual query-string params server-side, so every field
 * here maps 1:1 to one query param name on `GET /api/catalog/courses/search`). */
export interface SearchCoursesQuery {
  readonly q?: string;
  readonly categoryId?: string;
  readonly instructorId?: string;
  readonly level?: CourseLevel;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly minRating?: number;
  readonly sort?: CourseSearchSort;
  readonly page?: number;
  readonly pageSize?: number;
  /** `format` filter (P11-07): `OnDemand` | `Live` | `Hybrid`. */
  readonly format?: DeliveryFormat;
}

/** Mirrors `CourseSearchResultItem`. */
export interface CourseSearchResultItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly thumbnailUrl: string | null;
  readonly price: number;
  readonly comparePrice: number | null;
  readonly currency: string;
  readonly level: CourseLevel;
  readonly language: CourseLanguage;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly enrollmentCount: number;
  readonly episodeCount: number;
  readonly totalDurationSeconds: number;
  readonly instructorId: string;
  readonly instructorDisplayName: string;
  readonly categoryId: string;
  readonly isWishlisted?: boolean;
  /** P11-07. Absent on older responses — treat a missing value as `OnDemand`. */
  readonly deliveryFormat?: DeliveryFormat;
  /** Start of the next upcoming live session (UTC); `null` for on-demand courses or when none is scheduled. */
  readonly nextStartsAtUtc?: IsoUtc | null;
}

/** Mirrors `FormatFacet` (P11-07). */
export interface FormatFacet {
  readonly format: DeliveryFormat;
  readonly count: number;
}

/** Mirrors `CategoryFacet`. */
export interface CategoryFacet {
  readonly categoryId: string;
  readonly count: number;
}

/** Mirrors `LevelFacet`. */
export interface LevelFacet {
  readonly level: CourseLevel;
  readonly count: number;
}

/** Mirrors `InstructorFacet` (task P1-10). */
export interface InstructorFacet {
  readonly instructorId: string;
  readonly displayName: string;
  readonly count: number;
}

/** Mirrors `CourseSearchFacets` — see that C# record's own doc comment: computed against the
 * search-matched + Published set BEFORE this request's own category/level/price/rating filters, not
 * "current filters minus this facet's own dimension". */
export interface CourseSearchFacets {
  readonly categories: readonly CategoryFacet[];
  readonly levels: readonly LevelFacet[];
  readonly instructors?: readonly InstructorFacet[];
  readonly formats?: readonly FormatFacet[];
}

/** Mirrors `SearchCoursesResponse`. */
export interface SearchCoursesResponse {
  readonly results: PagedResult<CourseSearchResultItem>;
  readonly facets: CourseSearchFacets;
}

/** Mirrors `CourseDetailInstructor`. */
export interface CourseDetailInstructor {
  readonly id: string;
  readonly displayName: string;
  readonly headline: string | null;
  readonly avatarUrl: string | null;
}

/** Mirrors `CourseDetailEpisode` — syllabus structure only, no `mediaAssetId`/anything
 * playback-related (see that C# record's own doc comment: actual video access is Phase 2's job). */
export interface CourseDetailEpisode {
  readonly id: string;
  readonly title: string;
  readonly sortOrder: number;
  readonly durationSeconds: number | null;
  readonly isFreePreview: boolean;
}

/** Mirrors `CourseDetailSection`. */
export interface CourseDetailSection {
  readonly id: string;
  readonly title: string;
  readonly sortOrder: number;
  readonly episodes: readonly CourseDetailEpisode[];
}

/** Mirrors `CourseDetailLiveSession` (P11-07). */
export interface CourseDetailLiveSession {
  readonly id: string;
  readonly title: string;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  /** Computed on the server — never recomputed in the browser. */
  readonly displayState: LiveDisplayState;
  readonly hasRecording: boolean;
}

/** Mirrors `CourseDetailLiveSchedule` (P11-07). */
export interface CourseDetailLiveSchedule {
  readonly timezone: string;
  readonly upcomingCount: number;
  readonly pastCount: number;
  readonly nextStartsAtUtc: IsoUtc | null;
  readonly sessions: readonly CourseDetailLiveSession[];
}

/** Mirrors `CourseDetailResponse` (`GET /api/catalog/courses/{slug}`, task P1-07). */
export interface CourseDetailResponse {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly level: CourseLevel;
  readonly language: CourseLanguage;
  readonly thumbnailUrl: string | null;
  readonly price: number;
  readonly comparePrice: number | null;
  readonly currency: string;
  readonly accessDurationDays: number | null;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly enrollmentCount: number;
  readonly episodeCount: number;
  readonly totalDurationSeconds: number;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly publishedAtUtc: string | null;
  readonly categoryId: string;
  readonly instructor: CourseDetailInstructor;
  readonly outcomes: readonly string[];
  readonly requirements: readonly string[];
  readonly sections: readonly CourseDetailSection[];
  readonly isWishlisted?: boolean;
  /** `OnDemand` | `Live` | `Hybrid` (P11-07). Absent on older responses — treat a missing value as `OnDemand`. */
  readonly deliveryFormat?: DeliveryFormat;
  /** Public live schedule (P11-07) — `null` for on-demand courses. Carries NO room link; the room is only ever
   * revealed through the Live module's join endpoint after an entitlement check. */
  readonly liveSchedule?: CourseDetailLiveSchedule | null;
}

/** Mirrors `Siri.Modules.Catalog.Domain.CourseStatus`. */
export type CourseStatus = 'Draft' | 'InReview' | 'Published' | 'Rejected' | 'Archived';

/** Mirrors `Siri.Modules.Catalog.Domain.CourseEpisodeStatus`. */
export type CourseEpisodeStatus = 'Draft' | 'Ready';

/** Mirrors `CourseBuilderEpisodeResponse`. */
export interface CourseBuilderEpisodeResponse {
  readonly id: string;
  readonly sectionId: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isFreePreview: boolean;
  readonly mediaAssetId: string | null;
  readonly durationSeconds: number | null;
  readonly status: CourseEpisodeStatus;
}

/** Mirrors `CourseBuilderSectionResponse`. */
export interface CourseBuilderSectionResponse {
  readonly id: string;
  readonly title: string;
  readonly sortOrder: number;
  readonly episodes: readonly CourseBuilderEpisodeResponse[];
}

/** Mirrors `CourseBuilderResponse`. */
export interface CourseBuilderResponse {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly instructorId: string;
  readonly categoryId: string;
  readonly level: CourseLevel;
  readonly language: CourseLanguage;
  readonly thumbnailUrl: string | null;
  readonly price: number;
  readonly comparePrice: number | null;
  readonly currency: string;
  readonly accessDurationDays: number | null;
  readonly status: CourseStatus;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly rowVersion: string;
  readonly outcomes: readonly string[];
  readonly requirements: readonly string[];
  readonly sections: readonly CourseBuilderSectionResponse[];
  readonly trailerMediaAssetId?: string | null;
}

/** Mirrors `AutosaveEpisodeItem`. */
export interface AutosaveEpisodeItem {
  readonly id?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly sortOrder: number;
  readonly isFreePreview: boolean;
  readonly mediaAssetId?: string | null;
  readonly durationSeconds?: number | null;
}

/** Mirrors `AutosaveSectionItem`. */
export interface AutosaveSectionItem {
  readonly id?: string | null;
  readonly title: string;
  readonly sortOrder: number;
  readonly episodes?: readonly AutosaveEpisodeItem[] | null;
}

/** Mirrors `AutosaveCourseCommand`. */
export interface AutosaveCourseCommand {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly description?: string | null;
  readonly categoryId: string;
  readonly level: CourseLevel;
  readonly language: CourseLanguage;
  readonly thumbnailUrl?: string | null;
  readonly price: number;
  readonly comparePrice?: number | null;
  readonly accessDurationDays?: number | null;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly outcomes?: readonly string[] | null;
  readonly requirements?: readonly string[] | null;
  readonly sections?: readonly AutosaveSectionItem[] | null;
  readonly rowVersion: string;
  readonly trailerMediaAssetId?: string | null;
}

export interface AttachEpisodeMediaCommand {
  readonly mediaAssetId: string;
  readonly durationSeconds?: number | null;
}

export interface EpisodeMediaResponse {
  readonly episodeId: string;
  readonly sectionId: string;
  readonly courseId: string;
  readonly mediaAssetId: string | null;
  readonly durationSeconds: number | null;
  readonly status: CourseEpisodeStatus;
}

/** Mirrors `AutosaveCourseResponse`. */
export interface AutosaveCourseResponse {
  readonly sections?: readonly {
    readonly id: string;
    readonly episodes: readonly { readonly id: string }[];
  }[];
  readonly courseId: string;
  readonly rowVersion: string;
  readonly updatedAtUtc: string;
}

export interface CreateCourseSectionCommand {
  readonly title: string;
}

export interface UpdateCourseSectionCommand {
  readonly title: string;
}

export interface CourseSectionResponse {
  readonly id: string;
  readonly courseId: string;
  readonly title: string;
  readonly sortOrder: number;
}

export interface CreateCourseEpisodeCommand {
  readonly title: string;
  readonly description?: string | null;
  readonly isFreePreview: boolean;
}

export interface UpdateCourseEpisodeCommand {
  readonly title: string;
  readonly description?: string | null;
  readonly isFreePreview: boolean;
}

export interface CourseEpisodeResponse {
  readonly id: string;
  readonly courseId: string;
  readonly sectionId: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isFreePreview: boolean;
  readonly mediaAssetId: string | null;
  readonly durationSeconds: number | null;
  readonly status: CourseEpisodeStatus;
}

export interface ReorderCourseSectionItem {
  readonly sectionId: string;
  readonly sortOrder: number;
}

export interface ReorderCourseSectionsCommand {
  readonly items: readonly ReorderCourseSectionItem[];
}

export interface ReorderCourseEpisodeItem {
  readonly episodeId: string;
  readonly sortOrder: number;
}

export interface ReorderCourseEpisodesCommand {
  readonly items: readonly ReorderCourseEpisodeItem[];
}

export interface CreateCourseCommand {
  readonly title: string;
  readonly categoryId: string;
  readonly level: CourseLevel;
  readonly language: CourseLanguage;
  readonly price: number;
}

export interface CreateCourseResponse {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly instructorId: string;
  readonly categoryId: string;
  readonly level: CourseLevel;
  readonly language: CourseLanguage;
  readonly price: number;
  readonly currency: string;
  readonly status: CourseStatus;
}

export interface InstructorCourseSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly thumbnailUrl: string | null;
  readonly price: number;
  readonly status: CourseStatus;
  readonly createdAtUtc: string;
}

export interface WishlistCourseItemResponse {
  readonly courseId: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly thumbnailUrl: string | null;
  readonly price: number;
  readonly comparePrice: number | null;
  readonly currency: string;
  /** `null` when the instructor profile cannot be resolved — callers omit the line, never invent a name. */
  readonly instructorName: string | null;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly wishlistedAtUtc: string;
}

export interface RatingDistributionResponse {
  readonly star5: number;
  readonly star4: number;
  readonly star3: number;
  readonly star2: number;
  readonly star1: number;
}

export interface CourseReviewItemResponse {
  readonly id: string;
  readonly courseId: string;
  readonly userId: string;
  /** `null` when the reviewer's account can no longer be resolved — never substitute a made-up name. */
  readonly userName: string | null;
  readonly rating: number;
  readonly comment: string | null;
  readonly createdAtUtc: string;
}

export interface CourseReviewSummaryResponse {
  readonly averageRating: number;
  readonly ratingCount: number;
  readonly distribution?: RatingDistributionResponse;
  readonly items: readonly CourseReviewItemResponse[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}
