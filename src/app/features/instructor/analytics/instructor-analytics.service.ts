import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { Guid, IsoUtc, LiveDisplayState } from '../../live/data/live.models';

export interface InstructorDropOffStat {
  readonly episodeNumber: number;
  readonly title: string;
  readonly viewersCount: number;
  readonly completionRate: number;
}

export interface InstructorStudentProgress {
  readonly id: string;
  /** `null` when the learner's account no longer exists — the API never invents a placeholder name (P11-10 §4). */
  readonly name: string | null;
  /** `null` for the same reason; never a made-up address. */
  readonly email: string | null;
  readonly courseTitle: string;
  readonly progressPercent: number;
  readonly completedEpisodes: number;
  readonly totalEpisodes: number;
  /** `null` when the learner never opened the course — shown as a neutral label, never a guessed date. */
  readonly lastActiveAtUtc: string | null;
}

export interface InstructorCourseOption {
  readonly id: string;
  readonly title: string;
}

/** Account-wide headline numbers (`InstructorDashboardKpis`) — not tied to the `range`/`courseId` query. */
export interface InstructorDashboardKpis {
  /** `YYYY-MM`, a UTC month — the same period key revenue splits are booked under. */
  readonly periodKey: string;
  readonly previousPeriodKey: string;
  readonly netRevenueThisMonth: number;
  readonly netRevenuePreviousMonth: number;
  /** `null` when last month's revenue was zero (no baseline to compare with). */
  readonly netRevenueChangePercent: number | null;
  readonly totalStudents: number;
  readonly newStudentsLast7Days: number;
  readonly publishedCourseCount: number;
  readonly totalCourseCount: number;
  /** `null` until the instructor has at least one review. */
  readonly ratingAverage: number | null;
  readonly ratingCount: number;
}

/** One course of the signed-in instructor (`InstructorCourseSummaryItem`) — never another instructor's. */
export interface InstructorCourseSummaryItem {
  readonly courseId: Guid;
  readonly title: string;
  readonly slug: string;
  /** `CourseStatus` name: Draft | InReview | Published | Rejected | Archived. Open string — render it, never assume. */
  readonly status: string;
  /** `DeliveryFormat` name: OnDemand | Live | Hybrid. */
  readonly deliveryFormat: string;
  readonly price: number;
  readonly enrollmentCount: number;
  readonly ratingAverage: number | null;
  readonly ratingCount: number;
  readonly thumbnailUrl: string | null;
}

export interface InstructorNextSession {
  readonly sessionId: Guid;
  readonly courseId: Guid;
  readonly courseTitle: string;
  readonly title: string;
  readonly startsAtUtc: IsoUtc;
  readonly endsAtUtc: IsoUtc;
  readonly displayState: LiveDisplayState;
  readonly expectedLearners: number;
  /** `false` = the room is not ready (no usable link) — the dashboard warns and links to the session page. */
  readonly meetingUsable: boolean;
}

export interface InstructorLiveAttendanceItem {
  readonly sessionId: Guid;
  readonly courseId: Guid;
  readonly courseTitle: string;
  readonly title: string;
  readonly startsAtUtc: IsoUtc;
  readonly expectedLearners: number;
  readonly joinedLearners: number;
  /** `null` when nobody was invited. */
  readonly attendanceRatePercent: number | null;
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
  // P11-10 additions — all additive; each is `null`/absent when the API has nothing to report.
  readonly kpis?: InstructorDashboardKpis | null;
  readonly courseSummaries?: readonly InstructorCourseSummaryItem[] | null;
  readonly nextSession?: InstructorNextSession | null;
  readonly liveAttendance?: readonly InstructorLiveAttendanceItem[] | null;
}

@Injectable({ providedIn: 'root' })
export class InstructorAnalyticsService extends ApiService {
  getSummary(
    range: '7d' | '30d' | '90d' = '30d',
    courseId?: string
  ): Observable<InstructorAnalyticsSummaryResponse> {
    return this.get<InstructorAnalyticsSummaryResponse>('/analytics/instructor/dashboard/summary', {
      range,
      courseId: courseId && courseId !== 'all' ? courseId : undefined,
    });
  }
}
