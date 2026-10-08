import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type {
  JoinLiveSessionResponse,
  MySessionsResponse,
  MyUpcomingSessionsResponse,
} from './live-learner.models';
import type { Guid } from './live.models';

/**
 * Learner-side Live endpoints (appendix §B.1–B.4): my sessions for a course, my upcoming sessions across courses, the
 * join gate, and the calendar file. Components never call `HttpClient` directly (frontend.md) — they go through here.
 *
 * Errors surface as `ApiError`; read the structured RFC 9457 body (`reason`, `opensAtUtc`, …) with `problemOf()`.
 *
 * Authorization is entirely server-side (`P11-05` §0 rule 2): the server decides who may see a session or get a room
 * link. The `canJoin`/`displayState` flags in these responses are display hints computed by the server, never something
 * the client may recompute.
 */
@Injectable({ providedIn: 'root' })
export class LiveLearnerApiService extends ApiService {
  /** `404 live.not_found` = no active enrollment in that course (callers hide the Live tab quietly). */
  getMySessions(courseId: Guid): Observable<MySessionsResponse> {
    return this.get<MySessionsResponse>(`/live/courses/${encodeURIComponent(courseId)}/my-sessions`);
  }

  getMyUpcoming(limit = 10): Observable<MyUpcomingSessionsResponse> {
    return this.get<MyUpcomingSessionsResponse>('/live/me/sessions/upcoming', { limit });
  }

  /**
   * The join gate. A successful response carries the room link (`Cache-Control: no-store`) — the caller must keep it in
   * a component signal only and clear it on destroy. Each call is a real, logged "link revealed" event on the server,
   * so callers must never invoke this from a constructor, resolver or effect.
   */
  joinSession(sessionId: Guid): Observable<JoinLiveSessionResponse> {
    return this.post<JoinLiveSessionResponse>(`/live/sessions/${encodeURIComponent(sessionId)}/join`, null);
  }

  /**
   * The `.ics` file for one session, fetched through `HttpClient` so the bearer token is attached (a plain `<a href>`
   * would not carry it). Error bodies arrive as a `Blob` because of the response type, so callers branch on the HTTP
   * status only.
   */
  downloadCalendar(sessionId: Guid): Observable<Blob> {
    return this.http.get(`${this.apiBaseUrl}/live/sessions/${encodeURIComponent(sessionId)}/calendar.ics`, {
      responseType: 'blob',
    });
  }
}
