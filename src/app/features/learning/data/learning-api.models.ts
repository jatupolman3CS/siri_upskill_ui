export interface PlaybackWatermark {
  readonly text: string;
  readonly userId: string;
  readonly email: string;
  readonly timestamp: string;
}

export interface PlaybackSessionResponse {
  readonly manifestUrl: string;
  readonly playbackUrl?: string;
  readonly expiresAtUtc: string;
  readonly watermarkPayload?: string;
  readonly watermark?: PlaybackWatermark | string;
}

export interface EpisodeProgressResponse {
  readonly id?: string;
  readonly enrollmentId?: string;
  readonly episodeId: string;
  readonly lastPositionSeconds?: number;
  readonly watchedSeconds?: number;
  readonly positionSeconds: number;
  readonly isCompleted: boolean;
  readonly completedAtUtc?: string | null;
  readonly lastWatchedAtUtc?: string;
  readonly updatedAtUtc?: string;
}

export interface UpsertEpisodeProgressRequest {
  readonly lastPositionSeconds: number;
  readonly watchedSeconds: number;
  readonly isCompleted: boolean;
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

export type EnrollmentStatus = 'Active' | 'Expired' | 'Revoked';

export interface EnrollmentItemResponse {
  readonly id: string;
  readonly courseId: string;
  readonly userId: string;
  readonly progressPercent: number;
  readonly status: EnrollmentStatus;
  readonly enrolledAtUtc: string;
  readonly expiresAtUtc: string | null;
  readonly completedAtUtc: string | null;
  // Optional enriched fields for UI
  readonly courseTitle?: string | null;
  readonly courseSlug?: string | null;
  readonly courseThumbnailUrl?: string | null;
  readonly instructorName?: string | null;
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

export interface CertificateDetailResponse {
  readonly id: string;
  readonly enrollmentId: string;
  readonly serialNo: string;
  readonly verifyCode: string;
  readonly issuedAtUtc: string;
  readonly pdfStorageKey?: string | null;
  readonly revokedAtUtc?: string | null;
  readonly learnerName: string;
  readonly courseTitle: string;
  readonly verifyUrl: string;
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

export type QuizQuestionType = 'SingleChoice' | 'MultipleChoice' | 1 | 2;

export interface LearnerQuizOption {
  readonly id: string;
  readonly text: string;
}

export interface LearnerQuizQuestion {
  readonly id: string;
  readonly type: QuizQuestionType;
  readonly prompt: string;
  readonly points: number;
  readonly options: readonly LearnerQuizOption[];
}

export interface LearnerQuiz {
  readonly id: string;
  readonly episodeId: string;
  readonly title: string;
  readonly passingScorePercent: number;
  readonly maxAttempts: number;
  readonly questions: readonly LearnerQuizQuestion[];
}

export interface QuizAttemptAnswer {
  readonly id: string;
  readonly questionId: string;
  readonly selectedOptionIds: readonly string[];
  readonly isCorrect: boolean;
}

export interface QuizAttempt {
  readonly id: string;
  readonly quizId: string;
  readonly enrollmentId: string;
  readonly attemptNo: number;
  readonly scorePercent: number;
  readonly isPassed: boolean;
  readonly startedAtUtc: string;
  readonly submittedAtUtc: string | null;
  readonly answers: readonly QuizAttemptAnswer[];
}

export interface StartQuizAttemptRequest {
  readonly quizId: string;
  readonly enrollmentId: string;
}

export interface SubmitQuizAnswerRequest {
  readonly questionId: string;
  readonly selectedOptionIds: readonly string[];
}

export interface AssignmentItem {
  readonly id: string;
  readonly episodeId: string;
  readonly title: string;
  readonly instructions: string;
  readonly dueDays: number;
  readonly maxFileSizeMb: number;
  readonly allowedExtensions: string;
}

export type AssignmentSubmissionStatus = 'Submitted' | 'Graded' | 'Rejected' | 1 | 2 | 3;

export interface AssignmentSubmissionItem {
  readonly id: string;
  readonly assignmentId: string;
  readonly enrollmentId: string;
  readonly storageKey: string;
  readonly note: string | null;
  readonly submittedAtUtc: string;
  readonly status: AssignmentSubmissionStatus;
  readonly score: number | null;
  readonly feedback: string | null;
  readonly gradedByUserId: string | null;
  readonly gradedAtUtc: string | null;
}

export interface SubmitAssignmentRequest {
  readonly assignmentId: string;
  readonly enrollmentId: string;
  readonly storageKey: string;
  readonly note: string | null;
}

export interface EpisodeAttachmentItem {
  readonly id: string;
  readonly episodeId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAtUtc: string;
}

export interface EpisodeAttachmentDownloadInfo {
  readonly id: string;
  readonly episodeId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** Absolute signed storage URL (P4-03c): use it immediately, never cache it. */
  readonly downloadUrl: string;
  readonly expiresAtUtc: string;
}
