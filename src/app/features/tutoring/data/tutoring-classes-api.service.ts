import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type {
  AddMaterialRequest,
  CancelClassRequest,
  CancelClassResponse,
  CompleteClassRequest,
  CompleteClassResponse,
  Guid,
  JoinTutoringSessionResponse,
  MaterialDownloadResponse,
  MaterialDto,
  PagedResult,
  RoomStatusDto,
  TutorAttendanceResponse,
  TutorCancellationQuote,
  TutorClassListItem,
  TutorClassScope,
  TutorSummaryResponse,
} from './tutoring-classes.models';

const TUTOR_BASE = '/tutoring/tutor/classes';
const SESSIONS_BASE = '/tutoring/sessions';

const classPath = (sessionId: Guid): string => `${TUTOR_BASE}/${encodeURIComponent(sessionId)}`;

/**
 * Tutor-side class endpoints of P13-10 (start, complete, summary, attendance, room, materials) and P13-08 (cancellation quote
 * and cancel), plus the class list. Every path names the session; the tutor is the caller (access token) and ownership is
 * decided by the server - another tutor's class and a missing one answer the same `404`.
 *
 * Policies differ on purpose: `start`, `complete`, `summary`, `attendance`, `room`, `meeting-link` and `materials` need a verified
 * tutor (`TutorOnly`); the list, `cancellation-quote` and `cancel` are `InstructorOnly` so a suspended tutor still sees and can
 * cancel what is left on their calendar (P13-README section 5.1, P13-10 section 7.5).
 */
@Injectable({ providedIn: 'root' })
export class TutoringClassesApiService extends ApiService {
  // --- List (P13-10 section 7.5) ------------------------------------------------------------------------------------------

  /**
   * The tutor's classes, `upcoming` (`Scheduled`, soonest first) or `history` (finished or cancelled, newest first). `InstructorOnly`:
   * a suspended tutor still sees what is pending; the `canStart` / `canComplete` flags on each row already say what they may do.
   */
  listClasses(scope: TutorClassScope, page: number, pageSize: number): Observable<PagedResult<TutorClassListItem>> {
    return this.get<PagedResult<TutorClassListItem>>(TUTOR_BASE, { scope, page, pageSize });
  }

  // --- Start / complete / summary / attendance ----------------------------------------------------------------------------

  /**
   * The primary path to the room: records the tutor's attendance and answers the room link. Refused with `409
   * tutoring.window_not_open` (+ `opensAtUtc`, `serverTimeUtc`) before the join window, `503 tutoring.room_not_ready` while the
   * room is being prepared, and `409 tutoring.session_cancelled` / `session_closed` / `session_ended`.
   */
  startClass(sessionId: Guid): Observable<JoinTutoringSessionResponse> {
    return this.post<JoinTutoringSessionResponse>(`${classPath(sessionId)}/start`, {});
  }

  completeClass(sessionId: Guid, request: CompleteClassRequest): Observable<CompleteClassResponse> {
    return this.post<CompleteClassResponse>(`${classPath(sessionId)}/complete`, request);
  }

  getSummary(sessionId: Guid): Observable<TutorSummaryResponse> {
    return this.get<TutorSummaryResponse>(`${classPath(sessionId)}/summary`);
  }

  /** Editable for a few days after the class; later answers `409 tutoring.summary_locked`. The body of the answer is not relied on. */
  saveSummary(sessionId: Guid, request: CompleteClassRequest): Observable<unknown> {
    return this.put<unknown>(`${classPath(sessionId)}/summary`, request);
  }

  getAttendance(sessionId: Guid): Observable<TutorAttendanceResponse> {
    return this.get<TutorAttendanceResponse>(`${classPath(sessionId)}/attendance`);
  }

  // --- Room -----------------------------------------------------------------------------------------------------------------

  getRoom(sessionId: Guid): Observable<RoomStatusDto> {
    return this.get<RoomStatusDto>(`${classPath(sessionId)}/room`);
  }

  /** `400 live.meeting_link_invalid` / `live.meeting_link_host_not_allowed`, `409 live.room_not_editable`. */
  setMeetingLink(sessionId: Guid, meetUrl: string): Observable<RoomStatusDto> {
    return this.put<RoomStatusDto>(`${classPath(sessionId)}/meeting-link`, { meetUrl });
  }

  /** Asks the server to try creating the room again (`409 live.meeting_not_resyncable` when there is nothing to retry). */
  retryRoom(sessionId: Guid): Observable<unknown> {
    return this.post<unknown>(`${classPath(sessionId)}/room/retry`, {});
  }

  // --- Materials (participants of the session: the tutor and the booked learners) --------------------------------------------

  listMaterials(sessionId: Guid): Observable<readonly MaterialDto[]> {
    return this.get<readonly MaterialDto[]>(`${SESSIONS_BASE}/${encodeURIComponent(sessionId)}/materials`);
  }

  addMaterial(sessionId: Guid, request: AddMaterialRequest): Observable<MaterialDto> {
    return this.post<MaterialDto>(`${classPath(sessionId)}/materials`, request);
  }

  /** One `multipart/form-data` part named `file` (+ optional `title`). `503 tutoring.materials_files_disabled` while files are switched off. */
  uploadMaterialFile(sessionId: Guid, file: File, title: string | null): Observable<MaterialDto> {
    const body = new FormData();
    body.append('file', file);
    if (title !== null) {
      body.append('title', title);
    }
    return this.post<MaterialDto>(`${classPath(sessionId)}/materials`, body);
  }

  removeMaterial(sessionId: Guid, materialId: Guid): Observable<void> {
    return this.delete<void>(`${classPath(sessionId)}/materials/${encodeURIComponent(materialId)}`);
  }

  getMaterialDownload(sessionId: Guid, materialId: Guid): Observable<MaterialDownloadResponse> {
    return this.get<MaterialDownloadResponse>(
      `${SESSIONS_BASE}/${encodeURIComponent(sessionId)}/materials/${encodeURIComponent(materialId)}/download`,
    );
  }

  // --- Cancellation (InstructorOnly: a suspended tutor can still cancel) --------------------------------------------------------

  getCancellationQuote(sessionId: Guid): Observable<TutorCancellationQuote> {
    return this.get<TutorCancellationQuote>(`${classPath(sessionId)}/cancellation-quote`);
  }

  cancelClass(sessionId: Guid, request: CancelClassRequest): Observable<CancelClassResponse> {
    return this.post<CancelClassResponse>(`${classPath(sessionId)}/cancel`, request);
  }
}
