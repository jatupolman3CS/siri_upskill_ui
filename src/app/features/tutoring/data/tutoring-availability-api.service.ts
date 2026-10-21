import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type {
  AvailabilityException,
  AvailabilitySettings,
  CreateExceptionRequest,
  ReplaceRulesRequest,
  SettingsRequest,
  TutorAvailability,
} from './tutoring-availability.models';
import type { Guid, PagedResult } from './tutoring-tutor.models';

const BASE = '/tutoring/tutor/availability';
/** Exceptions are capped at 200 per tutor (`MaxFutureExceptions`); the list is paged at this size (contract maximum 100). */
export const EXCEPTIONS_PAGE_SIZE = 10;

/**
 * Tutor availability endpoints of P13-03 (section 6.1). All of them sit behind the server's `TutorOnly` policy (an approved
 * instructor whose tutor profile is `Verified` right now) and none carries a tutor id: the tutor is the caller.
 *
 * Errors surface as `ApiError`; resolve the stable RFC 9457 `reason` with `tutoringErrorKey()` and the structured detail with
 * `tutoringProblemOf()` (`index` + `violation` on a rejected rule, `violation` on a rejected exception).
 */
@Injectable({ providedIn: 'root' })
export class TutoringAvailabilityApiService extends ApiService {
  getAvailability(): Observable<TutorAvailability> {
    return this.get<TutorAvailability>(BASE);
  }

  /** A stale `rowVersion` answers `409 tutoring.concurrent_update`; an out-of-range value answers a `400` naming the field. */
  saveSettings(request: SettingsRequest): Observable<AvailabilitySettings> {
    return this.put<AvailabilitySettings>(`${BASE}/settings`, request);
  }

  /** Replaces the WHOLE weekly set (last writer wins); `[]` clears it. A rejected rule answers `400` with its `index`. */
  replaceRules(request: ReplaceRulesRequest): Observable<TutorAvailability> {
    return this.put<TutorAvailability>(`${BASE}/rules`, request);
  }

  /** Upcoming exceptions, soonest first (the server's default `from` is today in Bangkok). */
  listExceptions(page: number): Observable<PagedResult<AvailabilityException>> {
    return this.get<PagedResult<AvailabilityException>>(`${BASE}/exceptions`, { page, pageSize: EXCEPTIONS_PAGE_SIZE });
  }

  addException(request: CreateExceptionRequest): Observable<AvailabilityException> {
    return this.post<AvailabilityException>(`${BASE}/exceptions`, request);
  }

  /** `404 tutoring.not_found` for an exception that is missing or belongs to someone else (the same answer for both). */
  deleteException(exceptionId: Guid): Observable<void> {
    return this.delete<void>(`${BASE}/exceptions/${encodeURIComponent(exceptionId)}`);
  }
}
