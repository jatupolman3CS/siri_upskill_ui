import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import {
  AssignmentItem,
  AssignmentSubmissionItem,
  CertificateDetailResponse,
  CertificateResponse,
  CertificateVerificationResponse,
  CourseProgressResponse,
  CreateDiscussionRequest,
  DiscussionItem,
  EnrollmentItemResponse,
  EpisodeAttachmentDownloadInfo,
  EpisodeAttachmentItem,
  EpisodeProgressResponse,
  LearnerQuiz,
  PlaybackSessionResponse,
  QuizAttempt,
  QuizAttemptAnswer,
  SubmitAssignmentRequest,
  UpsertEpisodeProgressRequest,
} from './learning-api.models';

export interface PagedResponse<T> {
  readonly items: readonly T[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class LearningApiService {
  private readonly http = inject(HttpClient);

  getPlaybackSession(episodeId: string): Observable<PlaybackSessionResponse> {
    return this.http.get<PlaybackSessionResponse>(`/api/media/playback/${episodeId}`);
  }

  getEpisodeProgressList(enrollmentId: string): Observable<EpisodeProgressResponse[]> {
    return this.http
      .get<EpisodeProgressResponse[]>(`/api/learning/enrollments/${enrollmentId}/episode-progress`)
      .pipe(
        map((list) =>
          (list ?? []).map((item) => ({
            ...item,
            positionSeconds: item.lastPositionSeconds ?? item.positionSeconds ?? 0,
          }))
        ),
        catchError(() => of([]))
      );
  }

  saveEpisodeProgress(
    enrollmentId: string,
    episodeId: string,
    data: UpsertEpisodeProgressRequest
  ): Observable<EpisodeProgressResponse> {
    return this.http
      .put<EpisodeProgressResponse>(
        `/api/learning/enrollments/${enrollmentId}/episode-progress/${episodeId}`,
        data
      )
      .pipe(
        map((res) => ({
          ...res,
          positionSeconds: res.lastPositionSeconds ?? res.positionSeconds ?? data.lastPositionSeconds,
        }))
      );
  }

  updateEnrollmentProgress(enrollmentId: string, progressPercent: number): Observable<EnrollmentItemResponse> {
    return this.http.put<EnrollmentItemResponse>(`/api/learning/enrollments/${enrollmentId}/progress`, {
      progressPercent,
    });
  }

  getCourseProgress(courseId: string): Observable<CourseProgressResponse> {
    return of({
      courseId,
      progressPercent: 0,
      isCompleted: false,
      completedEpisodesCount: 0,
      totalEpisodesCount: 0,
      episodes: [],
    });
  }

  getEpisodeProgress(episodeId = ''): Observable<EpisodeProgressResponse | null> {
    return of(episodeId ? { episodeId, positionSeconds: 0, isCompleted: false } : null);
  }

  saveHeartbeatProgress(episodeId: string, positionSeconds: number): Observable<EpisodeProgressResponse> {
    return of({
      episodeId,
      positionSeconds,
      lastPositionSeconds: positionSeconds,
      watchedSeconds: positionSeconds,
      isCompleted: false,
      lastWatchedAtUtc: new Date().toISOString(),
    });
  }

  getMyEnrollments(page = 1, pageSize = 50): Observable<PagedResponse<EnrollmentItemResponse>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<EnrollmentItemResponse>>('/api/learning/enrollments/me', { params });
  }

  getMyCertificates(page = 1, pageSize = 50): Observable<PagedResponse<CertificateResponse>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<CertificateResponse>>('/api/learning/certificates/me', { params });
  }

  getCertificateByEnrollment(enrollmentId: string): Observable<CertificateDetailResponse> {
    return this.http.get<CertificateDetailResponse>(`/api/learning/certificates/by-enrollment/${enrollmentId}`);
  }

  getCertificateByCourse(courseId: string): Observable<CertificateDetailResponse> {
    return this.http.get<CertificateDetailResponse>(`/api/learning/certificates/by-course/${courseId}`);
  }

  downloadCertificatePdf(certificateId: string): Observable<Blob> {
    return this.http.get(`/api/learning/certificates/${certificateId}/download`, {
      responseType: 'blob',
    });
  }

  downloadCertificatePdfByVerifyCode(verifyCode: string): Observable<Blob> {
    return this.http.get(`/api/learning/certificates/verify/${encodeURIComponent(verifyCode)}/download`, {
      responseType: 'blob',
    });
  }

  verifyCertificate(verifyCode: string): Observable<CertificateVerificationResponse> {
    return this.http.get<CertificateVerificationResponse>(`/api/learning/certificates/verify/${verifyCode}`);
  }

  // --- Quizzes ---
  getLearnerQuizByEpisode(episodeId: string): Observable<LearnerQuiz> {
    return this.http.get<LearnerQuiz>(`/api/learning/quizzes/by-episode/${episodeId}`);
  }

  startQuizAttempt(quizId: string, enrollmentId: string): Observable<QuizAttempt> {
    return this.http.post<QuizAttempt>('/api/learning/quiz-attempts', { quizId, enrollmentId });
  }

  answerQuizQuestion(attemptId: string, questionId: string, selectedOptionIds: readonly string[]): Observable<QuizAttemptAnswer> {
    return this.http.post<QuizAttemptAnswer>(`/api/learning/quiz-attempts/${attemptId}/answers`, {
      questionId,
      selectedOptionIds,
    });
  }

  submitQuizAttempt(attemptId: string): Observable<QuizAttempt> {
    return this.http.post<QuizAttempt>(`/api/learning/quiz-attempts/${attemptId}/submit`, {});
  }

  getQuizAttemptsByQuiz(quizId: string): Observable<QuizAttempt[]> {
    return this.http.get<QuizAttempt[]>(`/api/learning/quiz-attempts/by-quiz/${quizId}`);
  }

  // --- Assignments ---
  getAssignmentByEpisode(episodeId: string): Observable<AssignmentItem> {
    return this.http.get<AssignmentItem>(`/api/learning/assignments/by-episode/${episodeId}`);
  }

  getMyAssignmentSubmission(assignmentId: string): Observable<AssignmentSubmissionItem | null> {
    return this.http.get<AssignmentSubmissionItem | null>(`/api/learning/assignment-submissions/by-assignment/${assignmentId}`);
  }

  submitAssignment(req: SubmitAssignmentRequest): Observable<AssignmentSubmissionItem> {
    return this.http.post<AssignmentSubmissionItem>('/api/learning/assignment-submissions', req);
  }

  // --- Attachments / Resources ---
  getEpisodeAttachments(episodeId: string): Observable<EpisodeAttachmentItem[]> {
    return this.http.get<EpisodeAttachmentItem[]>(`/api/catalog/episodes/${episodeId}/attachments`);
  }

  downloadEpisodeAttachment(episodeId: string, attachmentId: string): Observable<EpisodeAttachmentDownloadInfo> {
    return this.http.get<EpisodeAttachmentDownloadInfo>(`/api/catalog/episodes/${episodeId}/attachments/${attachmentId}/download`);
  }

  // --- Community Q&A ---
  getDiscussions(episodeId: string, page = 1, pageSize = 20): Observable<PagedResponse<DiscussionItem>> {
    const params = new HttpParams()
      .set('episodeId', episodeId)
      .set('page', page)
      .set('pageSize', pageSize);

    return this.http.get<PagedResponse<DiscussionItem>>('/api/community/discussions', { params });
  }

  createDiscussion(req: CreateDiscussionRequest): Observable<DiscussionItem> {
    return this.http.post<DiscussionItem>('/api/community/discussions', req);
  }

  upvoteDiscussion(discussionId: string): Observable<DiscussionItem> {
    return this.http.post<DiscussionItem>(`/api/community/discussions/${discussionId}/upvote`, {});
  }

  deleteDiscussion(discussionId: string): Observable<void> {
    return this.http.delete<void>(`/api/community/discussions/${discussionId}`);
  }
}

