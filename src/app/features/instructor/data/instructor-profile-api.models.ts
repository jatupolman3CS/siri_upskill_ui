/**
 * Mirrors `Siri.Modules.Catalog` `InstructorApplicationStatus` (serialized by name through the API's global
 * `JsonStringEnumConverter`).
 */
export type InstructorApplicationStatus = 'Pending' | 'Approved' | 'Rejected';

/**
 * Mirrors `InstructorProfileResponse` (`GET /api/catalog/instructors/me`) and `ApplyAsInstructorResponse`
 * (`POST /api/catalog/instructors/apply`) — the two records have identical fields.
 */
export interface InstructorProfileResponse {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
  readonly revenueSharePercent: number;
  readonly status: InstructorApplicationStatus;
  readonly approvedAtUtc: string | null;
}

/**
 * Mirrors `ApplyAsInstructorCommand` — deliberately carries no user id: the caller is always the
 * authenticated user, resolved on the server.
 */
export interface ApplyAsInstructorRequest {
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
}
