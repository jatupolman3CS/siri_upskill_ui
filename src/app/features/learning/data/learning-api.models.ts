export interface PlaybackWatermark {
  readonly text: string;
  readonly userId: string;
  readonly email: string;
  readonly timestamp: string;
}

export interface PlaybackSessionResponse {
  readonly playbackUrl: string;
  readonly expiresAtUtc: string;
  readonly watermark: PlaybackWatermark;
}

export interface EpisodeProgressResponse {
  readonly episodeId: string;
  readonly positionSeconds: number;
  readonly isCompleted: boolean;
  readonly completedAtUtc?: string | null;
  readonly lastWatchedAtUtc: string;
}

export interface CourseProgressResponse {
  readonly courseId: string;
  readonly progressPercent: number;
  readonly isCompleted: boolean;
  readonly completedEpisodesCount: number;
  readonly totalEpisodesCount: number;
  readonly episodes: readonly EpisodeProgressResponse[];
}

export interface DiscussionItem {
  readonly id: string;
  readonly courseId: string;
  readonly episodeId: string | null;
  readonly userId: string;
  readonly parentId: string | null;
  readonly body: string;
  readonly isInstructorAnswer: boolean;
  readonly status: number;
  readonly upvoteCount: number;
  readonly createdAtUtc: string;
}

export interface CreateDiscussionRequest {
  readonly courseId: string;
  readonly episodeId: string | null;
  readonly parentId: string | null;
  readonly body: string;
}

export type EnrollmentStatus = 'Active' | 'Completed' | 'Expired' | 'Revoked';

export interface EnrollmentItemResponse {
  readonly id: string;
  readonly courseId: string;
  readonly userId: string;
  readonly progressPercentage: number;
  readonly status: EnrollmentStatus;
  readonly enrolledAtUtc: string;
  readonly expiresAtUtc: string | null;
  readonly completedAtUtc: string | null;
  // Optional enriched fields for UI
  readonly courseTitle?: string;
  readonly courseSlug?: string;
  readonly courseThumbnailUrl?: string;
  readonly instructorName?: string;
}

export interface CertificateResponse {
  readonly id: string;
  readonly enrollmentId: string;
  readonly serialNo: string;
  readonly verifyCode: string;
  readonly issuedAtUtc: string;
  readonly pdfStorageKey?: string | null;
  readonly revokedAtUtc?: string | null;
  readonly certificateNumber?: string;
  readonly isRevoked?: boolean;
}

export interface CertificateVerificationResponse {
  readonly serialNo: string;
  readonly verifyCode: string;
  readonly issuedAtUtc: string;
  readonly isValid: boolean;
  readonly revokedAtUtc?: string | null;
  readonly learnerName?: string | null;
  readonly courseTitle?: string | null;
  readonly recipientName?: string;
  readonly instructorName?: string;
  readonly certificateNumber?: string;
}

