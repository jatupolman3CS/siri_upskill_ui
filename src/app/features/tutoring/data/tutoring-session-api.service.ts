import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { Guid, JoinTutoringSessionResponse, MaterialDownloadResponse, MaterialDto } from './tutoring-classes.models';

const sessionPath = (sessionId: Guid): string => `/tutoring/sessions/${encodeURIComponent(sessionId)}`;

/**
 * Class (session) endpoints a signed-in participant calls by session id (P13-10): joining the room, the learner's "the tutor is
 * here" attestation and the class materials. The caller is the access token; the role (learner or tutor) is decided by the server
 * from who owns the class or the confirmed booking, and every id that is not the caller's answers the same `404` as one that does
 * not exist. The tutor-only start / complete / summary live in `TutoringClassesApiService`.
 */
@Injectable({ providedIn: 'root' })
export class TutoringSessionApiService extends ApiService {
  /**
   * The single call that reveals the room link (`meetUrl`, a capability: keep it in a component signal only). Refused with `409
   * tutoring.window_not_open` (+ `opensAtUtc`, `serverTimeUtc`) before the window, `409 tutoring.session_cancelled | session_closed |
   * session_ended`, `503 tutoring.room_not_ready` while the room is being prepared and `404 tutoring.not_found` for everything else.
   */
  joinSession(sessionId: Guid): Observable<JoinTutoringSessionResponse> {
    return this.post<JoinTutoringSessionResponse>(`${sessionPath(sessionId)}/join`, {});
  }

  /** `204`, idempotent: the learner says the tutor is in the room. `404` when the attestation is switched off or the caller is no participant. */
  markTutorPresent(sessionId: Guid): Observable<void> {
    return this.post<void>(`${sessionPath(sessionId)}/tutor-present`, {});
  }

  listMaterials(sessionId: Guid): Observable<readonly MaterialDto[]> {
    return this.get<readonly MaterialDto[]>(`${sessionPath(sessionId)}/materials`);
  }

  /** A short-lived signed address for a `File` material: use it straight away, never keep it. */
  getMaterialDownload(sessionId: Guid, materialId: Guid): Observable<MaterialDownloadResponse> {
    return this.get<MaterialDownloadResponse>(`${sessionPath(sessionId)}/materials/${encodeURIComponent(materialId)}/download`);
  }
}
