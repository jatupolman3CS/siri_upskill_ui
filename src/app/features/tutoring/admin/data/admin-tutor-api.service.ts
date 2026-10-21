import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import type { Guid } from '../../data/tutoring-public.models';
import type {
  AdminSubject,
  AdminTutorDetail,
  AdminTutorListItem,
  AdminTutorQuery,
  CreateSubjectRequest,
  PagedResult,
  ReinstateTutorRequest,
  SetCommissionRequest,
  SuspendTutorRequest,
  UpdateSubjectRequest,
} from './admin-tutor.models';

const BASE = '/tutoring/admin';

/**
 * Tutor moderation and the subject catalogue (P13-01 section 6.2, `AdminOnly`). Suspend, reinstate and the commission change
 * each write an audit row atomically with the change; the answer to all three is the tutor as it is now. A tutor is moved by
 * the server's state machine only - a status the tutor is not in answers `409 tutoring.invalid_transition`.
 */
@Injectable({ providedIn: 'root' })
export class AdminTutorApiService extends ApiService {
  listTutors(query: AdminTutorQuery): Observable<PagedResult<AdminTutorListItem>> {
    return this.get<PagedResult<AdminTutorListItem>>(`${BASE}/tutors`, {
      status: query.status,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  getTutor(tutorId: Guid): Observable<AdminTutorDetail> {
    return this.get<AdminTutorDetail>(`${BASE}/tutors/${encodeURIComponent(tutorId)}`);
  }

  /** `Verified -> Suspended`: hides the profile, ends `TutorOnly` access and starts the cancel-and-refund of future classes. */
  suspend(tutorId: Guid, request: SuspendTutorRequest): Observable<AdminTutorDetail> {
    return this.post<AdminTutorDetail>(`${BASE}/tutors/${encodeURIComponent(tutorId)}/suspend`, request);
  }

  /** `Suspended -> Verified`; the tutor is not listed again until they reopen themselves. */
  reinstate(tutorId: Guid, request: ReinstateTutorRequest): Observable<AdminTutorDetail> {
    return this.post<AdminTutorDetail>(`${BASE}/tutors/${encodeURIComponent(tutorId)}/reinstate`, request);
  }

  setCommission(tutorId: Guid, request: SetCommissionRequest): Observable<AdminTutorDetail> {
    return this.put<AdminTutorDetail>(`${BASE}/tutors/${encodeURIComponent(tutorId)}/commission`, request);
  }

  /** Groups first, each followed by its subjects; inactive ones included only when asked. */
  listSubjects(includeInactive: boolean, page: number, pageSize: number): Observable<PagedResult<AdminSubject>> {
    return this.get<PagedResult<AdminSubject>>(`${BASE}/subjects`, { includeInactive, page, pageSize });
  }

  createSubject(request: CreateSubjectRequest): Observable<AdminSubject> {
    return this.post<AdminSubject>(`${BASE}/subjects`, request);
  }

  /** There is no delete and no slug change: a subject is renamed, moved, re-sorted or switched off. */
  updateSubject(subjectId: Guid, request: UpdateSubjectRequest): Observable<AdminSubject> {
    return this.put<AdminSubject>(`${BASE}/subjects/${encodeURIComponent(subjectId)}`, request);
  }
}
