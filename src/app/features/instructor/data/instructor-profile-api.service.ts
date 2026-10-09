import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { ApplyAsInstructorRequest, InstructorProfileResponse } from './instructor-profile-api.models';

/**
 * The one `*ApiService` for the signed-in user's own instructor application/profile
 * (`/api/catalog/instructors/*`, backed by `InstructorController` in the Catalog module) — components
 * never call `HttpClient` directly (frontend.md).
 */
@Injectable({ providedIn: 'root' })
export class InstructorProfileApiService extends ApiService {
  /** The caller's own application/profile. Answers 404 when the user has never applied. */
  getMyProfile(): Observable<InstructorProfileResponse> {
    return this.get<InstructorProfileResponse>('/catalog/instructors/me');
  }

  /** Submits (or, after a rejection, resubmits) the caller's instructor application. */
  apply(request: ApplyAsInstructorRequest): Observable<InstructorProfileResponse> {
    return this.post<InstructorProfileResponse>('/catalog/instructors/apply', request);
  }
}
