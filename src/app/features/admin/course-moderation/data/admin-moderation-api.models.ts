export interface PendingCourseReviewSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly instructorId: string;
  readonly instructorName?: string | null;
  readonly categoryId: string;
  readonly categoryName?: string | null;
  readonly price: number;
  readonly thumbnailUrl?: string | null;
  readonly episodeCount: number;
  readonly totalDurationMinutes: number;
  readonly submittedAtUtc?: string | null;
}

export interface PagedPendingCoursesResponse {
  readonly items: readonly PendingCourseReviewSummary[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface RejectCourseRequest {
  readonly reason: string;
}

export interface ApproveCourseResponse {
  readonly id: string;
  readonly status: string;
  readonly publishedAtUtc: string | null;
}

export interface RejectCourseResponse {
  readonly id: string;
  readonly status: string;
  readonly rejectionReason: string;
}
