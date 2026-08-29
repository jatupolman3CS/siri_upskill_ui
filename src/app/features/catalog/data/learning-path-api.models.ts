export interface LearningPathSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly courseCount: number;
  readonly createdAtUtc: string;
}

export interface LearningPathCourseItem {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly sortOrder: number;
}

export interface LearningPathDetail {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly courses: readonly LearningPathCourseItem[];
  readonly createdAtUtc: string;
}
