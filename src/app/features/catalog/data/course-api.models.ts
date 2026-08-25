import { PagedResult } from '../../../core/http/paged-result.model';

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
  readonly level?: CourseLevel;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly minRating?: number;
  readonly sort?: CourseSearchSort;
  readonly page?: number;
  readonly pageSize?: number;
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

/** Mirrors `CourseSearchFacets` — see that C# record's own doc comment: computed against the
 * search-matched + Published set BEFORE this request's own category/level/price/rating filters, not
 * "current filters minus this facet's own dimension". */
export interface CourseSearchFacets {
  readonly categories: readonly CategoryFacet[];
  readonly levels: readonly LevelFacet[];
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
}

/** Mirrors `AutosaveEpisodeItem`. */
export interface AutosaveEpisodeItem {
  readonly id?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly sortOrder: number;
  readonly isFreePreview: boolean;
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
}

/** Mirrors `AutosaveCourseResponse`. */
export interface AutosaveCourseResponse {
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

