export interface TopCourseSummary {
  courseId: string;
  courseTitle: string;
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
