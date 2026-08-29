import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ApproveCourseResponse,
  PagedPendingCoursesResponse,
  RejectCourseRequest,
  RejectCourseResponse,
} from './admin-moderation-api.models';

@Injectable({ providedIn: 'root' })
export class AdminModerationApiService {
  private readonly http = inject(HttpClient);

  getPendingCourses(page = 1, pageSize = 20): Observable<PagedPendingCoursesResponse> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedPendingCoursesResponse>('/api/catalog/admin/courses/pending', { params });
  }

  approveCourse(courseId: string): Observable<ApproveCourseResponse> {
    return this.http.post<ApproveCourseResponse>(`/api/catalog/admin/courses/${courseId}/approve`, {});
  }

  rejectCourse(courseId: string, request: RejectCourseRequest): Observable<RejectCourseResponse> {
    return this.http.post<RejectCourseResponse>(`/api/catalog/admin/courses/${courseId}/reject`, request);
  }

  unpublishCourse(courseId: string, request: { reason: string }): Observable<unknown> {
    return this.http.post(`/api/catalog/admin/courses/${courseId}/unpublish`, request);
  }
}
