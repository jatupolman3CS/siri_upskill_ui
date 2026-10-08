import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { PagedResult } from '../../../core/http/paged-result.model';
import type {
  AttachSessionRecordingRequest,
  CancelLiveSessionRequest,
  CourseLiveSchedule,
  CourseMeetingsResponse,
  GoogleConnectionStatus,
  GoogleConnectResponse,
  InstructorMeetingSummary,
  InstructorSessionDetail,
  InstructorSessionListItem,
  InstructorSessionListQuery,
  LiveSession,
  LiveSessionRecording,
  LiveSessionWriteRequest,
  RosterItem,
  RosterQuery,
  SetDeliveryFormatRequest,
  SetDeliveryFormatResponse,
  SetEnrollmentPolicyRequest,
  SetEnrollmentPolicyResponse,
  SetLiveSettingsRequest,
  SetLiveSettingsResponse,
} from './live-instructor.models';
import type { DeliveryFormat, Guid } from './live.models';

/**
 * Every instructor-side Live endpoint (appendix §A, §B.5, §C): Google connection, room status, session list/detail/roster
 * and the Catalog live-schedule writes. Components never call `HttpClient` (frontend.md) — they go through here.
 *
 * Errors surface as `ApiError`; read the structured RFC 9457 body (`reason`, `sessionIds`, …) with `problemOf()`.
 */
@Injectable({ providedIn: 'root' })
export class LiveInstructorApiService extends ApiService {
  // --- Google connection (A.1 .. A.4) --------------------------------------------------------------------------------

  getGoogleStatus(): Observable<GoogleConnectionStatus> {
    return this.get<GoogleConnectionStatus>('/live/instructor/google/status');
  }

  /** Returns the Google consent URL; the caller navigates the whole window to it (it is a top-level redirect). */
  connectGoogle(returnPath?: string): Observable<GoogleConnectResponse> {
    return this.post<GoogleConnectResponse>('/live/instructor/google/connect', returnPath ? { returnPath } : {});
  }

  disconnectGoogle(): Observable<void> {
    return this.delete<void>('/live/instructor/google');
  }

  // --- Room status (A.5) ---------------------------------------------------------------------------------------------

  getCourseMeetings(courseId: Guid): Observable<CourseMeetingsResponse> {
    return this.get<CourseMeetingsResponse>(`/live/instructor/courses/${encodeURIComponent(courseId)}/meetings`);
  }

  /** The response never echoes the link back. */
  setMeetingLink(sessionId: Guid, meetUrl: string): Observable<InstructorMeetingSummary> {
    return this.put<InstructorMeetingSummary>(
      `/live/instructor/sessions/${encodeURIComponent(sessionId)}/meeting-link`,
      { meetUrl },
    );
  }

  resyncMeeting(sessionId: Guid): Observable<InstructorMeetingSummary> {
    return this.post<InstructorMeetingSummary>(
      `/live/instructor/sessions/${encodeURIComponent(sessionId)}/meeting/resync`,
      {},
    );
  }

  // --- Sessions / roster (B.5) ---------------------------------------------------------------------------------------

  listSessions(query: InstructorSessionListQuery): Observable<PagedResult<InstructorSessionListItem>> {
    return this.get<PagedResult<InstructorSessionListItem>>('/live/instructor/sessions', {
      scope: query.scope,
      courseId: query.courseId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  /** The only instructor response that carries `meetUrl` — keep it in a component signal, never persist it. */
  getSessionDetail(sessionId: Guid): Observable<InstructorSessionDetail> {
    return this.get<InstructorSessionDetail>(`/live/instructor/sessions/${encodeURIComponent(sessionId)}`);
  }

  getRoster(sessionId: Guid, query: RosterQuery): Observable<PagedResult<RosterItem>> {
    return this.get<PagedResult<RosterItem>>(`/live/instructor/sessions/${encodeURIComponent(sessionId)}/roster`, {
      filter: query.filter,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 50,
    });
  }

  // --- Catalog live-schedule (C.1 .. C.4) ----------------------------------------------------------------------------

  getLiveSchedule(courseId: Guid): Observable<CourseLiveSchedule> {
    return this.get<CourseLiveSchedule>(`/catalog/instructor/courses/${encodeURIComponent(courseId)}/live-schedule`);
  }

  createSession(courseId: Guid, body: LiveSessionWriteRequest): Observable<LiveSession> {
    return this.post<LiveSession>(`/catalog/instructor/courses/${encodeURIComponent(courseId)}/live-sessions`, body);
  }

  updateSession(courseId: Guid, sessionId: Guid, body: LiveSessionWriteRequest): Observable<LiveSession> {
    return this.put<LiveSession>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/live-sessions/${encodeURIComponent(sessionId)}`,
      body,
    );
  }

  cancelSession(courseId: Guid, sessionId: Guid, reason: string): Observable<LiveSession> {
    const body: CancelLiveSessionRequest = { reason };
    return this.post<LiveSession>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/live-sessions/${encodeURIComponent(sessionId)}/cancel`,
      body,
    );
  }

  setDeliveryFormat(courseId: Guid, deliveryFormat: DeliveryFormat): Observable<SetDeliveryFormatResponse> {
    const body: SetDeliveryFormatRequest = { deliveryFormat };
    return this.put<SetDeliveryFormatResponse>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/delivery-format`,
      body,
    );
  }

  setEnrollmentPolicy(courseId: Guid, body: SetEnrollmentPolicyRequest): Observable<SetEnrollmentPolicyResponse> {
    return this.put<SetEnrollmentPolicyResponse>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/enrollment-policy`,
      body,
    );
  }

  setLiveSettings(courseId: Guid, googleAttendeeSyncEnabled: boolean): Observable<SetLiveSettingsResponse> {
    const body: SetLiveSettingsRequest = { googleAttendeeSyncEnabled };
    return this.put<SetLiveSettingsResponse>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/live-settings`,
      body,
    );
  }

  /** Upload the video first (`MediaApiService`), wait for the asset to be `Ready`, then attach it to the session. */
  attachRecording(
    courseId: Guid,
    sessionId: Guid,
    body: AttachSessionRecordingRequest,
  ): Observable<LiveSessionRecording> {
    return this.post<LiveSessionRecording>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/live-sessions/${encodeURIComponent(sessionId)}/recording`,
      body,
    );
  }
}
