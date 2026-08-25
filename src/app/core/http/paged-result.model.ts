/**
 * Mirrors `Siri.SharedKernel.PagedResult<T>` exactly (`totalPages` is a computed C# property, still
 * serialized like any other public property under `System.Text.Json`'s defaults). First real frontend
 * consumer is `CourseApiService.searchCourses` (P1-21); shared here rather than duplicated per feature
 * since any future paginated endpoint (admin lists, reviews, ...) reuses this exact backend shape.
 */
export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}
