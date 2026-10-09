/**
 * Mirrors the admin instructor-application contract of `Siri.Api/Controllers/Catalog/InstructorController.cs` and the
 * records under `Siri.Modules.Catalog/Features/{GetPendingInstructorApplications,ApproveInstructorApplication,
 * RejectInstructorApplication}`. Field names are copied verbatim (camelCase on the wire); enums travel as their names
 * (global `JsonStringEnumConverter`). The paged envelope is `core/http/paged-result.model.ts`.
 */

/** `InstructorApplicationStatus`. */
export type AdminInstructorApplicationStatus = 'Pending' | 'Approved' | 'Rejected';

/** `InstructorApplicationSummary` — one row of `GET /api/catalog/admin/instructors/pending` (every row is `Pending`). */
export interface InstructorApplicationSummary {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly headline: string | null;
  readonly bio: string;
  readonly createdAtUtc: string;
}

/** `ApproveInstructorApplicationResponse` — the server also grants the Instructor role in the same commit. */
export interface ApproveInstructorApplicationResponse {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly status: AdminInstructorApplicationStatus;
  readonly approvedAtUtc: string | null;
}

/** `RejectInstructorApplicationResponse`. The reject endpoint takes no body, so there is no reason to record. */
export interface RejectInstructorApplicationResponse {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly status: AdminInstructorApplicationStatus;
}
