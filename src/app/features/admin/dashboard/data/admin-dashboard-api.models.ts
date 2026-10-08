export interface TopCourseSummary {
  courseId: string;
  /** `null` when the title cannot be resolved (e.g. the course was removed) — show a neutral label, never a guess. */
  courseTitle: string | null;
  totalRevenue: number;
  totalEnrollments: number;
  totalViews: number;
}

export interface AdminDashboardSummaryResponse {
  todaySales: number;
  todayNewLearners: number;
  totalLearners: number;
  pendingCourseReviewsCount: number;
  pendingRefundsCount: number;
  topCourses30Days: readonly TopCourseSummary[];
}
