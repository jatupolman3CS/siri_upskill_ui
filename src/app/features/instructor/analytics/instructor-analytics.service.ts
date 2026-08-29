import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface InstructorDropOffStat {
  readonly episodeNumber: number;
  readonly title: string;
  readonly viewersCount: number;
  readonly completionRate: number;
}

export interface InstructorStudentProgress {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly courseTitle: string;
  readonly progressPercent: number;
  readonly completedEpisodes: number;
  readonly totalEpisodes: number;
  readonly lastActiveAtUtc: string;
}

export interface InstructorCourseOption {
  readonly id: string;
  readonly title: string;
}

export interface InstructorAnalyticsSummaryResponse {
  readonly totalViews: number;
  readonly totalWatchMinutes: number;
  readonly avgCompletionRate: number;
  readonly totalRevenue: number;
  readonly totalEnrollments: number;
  readonly dropOffStats: readonly InstructorDropOffStat[];
  readonly students: readonly InstructorStudentProgress[];
  readonly courses: readonly InstructorCourseOption[];
}

@Injectable({ providedIn: 'root' })
export class InstructorAnalyticsService {
  private readonly http = inject(HttpClient);

  getSummary(
    range: '7d' | '30d' | '90d' = '30d',
    courseId?: string
  ): Observable<InstructorAnalyticsSummaryResponse> {
    let params = new HttpParams().set('range', range);
    if (courseId && courseId !== 'all') {
      params = params.set('courseId', courseId);
    }

    return this.http.get<InstructorAnalyticsSummaryResponse>(
      '/api/analytics/instructor/dashboard/summary',
      { params }
    );
  }
}
