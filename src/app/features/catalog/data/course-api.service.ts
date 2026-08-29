import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { PagedResult } from '../../../core/http/paged-result.model';
import {
  AutosaveCourseCommand,
  AutosaveCourseResponse,
  CourseBuilderResponse,
  CourseDetailResponse,
  CourseEpisodeResponse,
  CourseSectionResponse,
  CreateCourseCommand,
  CreateCourseEpisodeCommand,
  CreateCourseResponse,
  CreateCourseSectionCommand,
  InstructorCourseSummary,
  ReorderCourseEpisodesCommand,
  ReorderCourseSectionsCommand,
  SearchCoursesQuery,
  SearchCoursesResponse,
  CourseReviewSummaryResponse,
  UpdateCourseEpisodeCommand,
  UpdateCourseSectionCommand,
  WishlistCourseItemResponse,
} from './course-api.models';

/**
 * The one `*ApiService` for `/api/catalog/courses/*` (P1-21) — components never call `HttpClient`
 * directly (frontend.md).
 */
@Injectable({ providedIn: 'root' })
export class CourseApiService extends ApiService {
  searchCourses(query: SearchCoursesQuery): Observable<SearchCoursesResponse> {
    return this.get<SearchCoursesResponse>('/catalog/courses/search', { ...query });
  }

  getCourseDetail(slug: string): Observable<CourseDetailResponse> {
    return this.get<CourseDetailResponse>(`/catalog/courses/${encodeURIComponent(slug)}`);
  }

  createCourse(command: CreateCourseCommand): Observable<CreateCourseResponse> {
    return this.post<CreateCourseResponse>('/catalog/instructor/courses', command);
  }

  getCourseBuilder(courseId: string): Observable<CourseBuilderResponse> {
    return this.get<CourseBuilderResponse>(`/catalog/instructor/courses/${encodeURIComponent(courseId)}/builder`);
  }

  autosaveCourse(courseId: string, command: AutosaveCourseCommand): Observable<AutosaveCourseResponse> {
    return this.put<AutosaveCourseResponse>(`/catalog/instructor/courses/${encodeURIComponent(courseId)}/autosave`, command);
  }

  submitCourseForReview(courseId: string): Observable<void> {
    return this.post<void>(`/catalog/instructor/courses/${encodeURIComponent(courseId)}/submit-for-review`, {});
  }

  createCourseSection(courseId: string, command: CreateCourseSectionCommand): Observable<CourseSectionResponse> {
    return this.post<CourseSectionResponse>(`/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections`, command);
  }

  updateCourseSection(courseId: string, sectionId: string, command: UpdateCourseSectionCommand): Observable<CourseSectionResponse> {
    return this.put<CourseSectionResponse>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
      command,
    );
  }

  deleteCourseSection(courseId: string, sectionId: string): Observable<void> {
    return this.delete<void>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
    );
  }

  reorderCourseSections(courseId: string, command: ReorderCourseSectionsCommand): Observable<void> {
    return this.put<void>(`/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections/reorder`, command);
  }

  createCourseEpisode(
    courseId: string,
    sectionId: string,
    command: CreateCourseEpisodeCommand,
  ): Observable<CourseEpisodeResponse> {
    return this.post<CourseEpisodeResponse>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}/episodes`,
      command,
    );
  }

  updateCourseEpisode(
    courseId: string,
    sectionId: string,
    episodeId: string,
    command: UpdateCourseEpisodeCommand,
  ): Observable<CourseEpisodeResponse> {
    return this.put<CourseEpisodeResponse>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}/episodes/${encodeURIComponent(episodeId)}`,
      command,
    );
  }

  deleteCourseEpisode(courseId: string, sectionId: string, episodeId: string): Observable<void> {
    return this.delete<void>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}/episodes/${encodeURIComponent(episodeId)}`,
    );
  }

  reorderCourseEpisodes(
    courseId: string,
    sectionId: string,
    command: ReorderCourseEpisodesCommand,
  ): Observable<void> {
    return this.put<void>(
      `/catalog/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}/episodes/reorder`,
      command,
    );
  }

  // --- Reviews (P1-08) ---
  getCourseReviews(
    courseId: string,
    page = 1,
    pageSize = 10,
  ): Observable<CourseReviewSummaryResponse> {
    return this.get<CourseReviewSummaryResponse>(`/catalog/courses/${encodeURIComponent(courseId)}/reviews`, {
      page,
      pageSize,
    });
  }

  createCourseReview(
    courseId: string,
    command: { rating: number; comment?: string },
  ): Observable<unknown> {
    return this.post(`/catalog/courses/${encodeURIComponent(courseId)}/reviews`, command);
  }

  getMyCourses(page = 1, pageSize = 50): Observable<PagedResult<InstructorCourseSummary>> {
    return this.get<PagedResult<InstructorCourseSummary>>('/catalog/instructor/courses', {
      page,
      pageSize,
    });
  }

  getWishlist(): Observable<WishlistCourseItemResponse[]> {
    return this.get<WishlistCourseItemResponse[]>('/catalog/wishlist');
  }

  addToWishlist(courseId: string): Observable<void> {
    return this.post<void>(`/catalog/wishlist/${encodeURIComponent(courseId)}`, {});
  }

  removeFromWishlist(courseId: string): Observable<void> {
    return this.delete<void>(`/catalog/wishlist/${encodeURIComponent(courseId)}`);
  }
}
