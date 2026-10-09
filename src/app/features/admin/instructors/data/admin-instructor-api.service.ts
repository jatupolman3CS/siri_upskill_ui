import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import { PagedResult } from '../../../../core/http/paged-result.model';
import {
  ApproveInstructorApplicationResponse,
  InstructorApplicationSummary,
  RejectInstructorApplicationResponse,
} from './admin-instructor-api.models';

/**
 * `*ApiService` for the AdminOnly instructor-application endpoints (`InstructorController`). Components never call
 * `HttpClient` directly (frontend.md).
 */
@Injectable({ providedIn: 'root' })
export class AdminInstructorApiService extends ApiService {
  /** Oldest application first. The server clamps `pageSize` to 1..100 (default 20). */
  getPending(page: number, pageSize: number): Observable<PagedResult<InstructorApplicationSummary>> {
    return this.get<PagedResult<InstructorApplicationSummary>>('/catalog/admin/instructors/pending', { page, pageSize });
  }

  /** 200 on success; 404 unknown id; 409 when the application is no longer `Pending`. Grants the Instructor role atomically. */
  approve(id: string): Observable<ApproveInstructorApplicationResponse> {
    return this.post<ApproveInstructorApplicationResponse>(`/catalog/admin/instructors/${encodeURIComponent(id)}/approve`, null);
  }

  /** 200 on success; 404 unknown id; 409 when the application is no longer `Pending`. Takes no body (no reason field). */
  reject(id: string): Observable<RejectInstructorApplicationResponse> {
    return this.post<RejectInstructorApplicationResponse>(`/catalog/admin/instructors/${encodeURIComponent(id)}/reject`, null);
  }
}
