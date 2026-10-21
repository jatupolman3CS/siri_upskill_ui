/**
 * Review DTOs of the learner side (P13-13 appendix, section 12). They mirror the contract field for field; if a C# record
 * disagrees with a type here, the C# record wins: report it, do not guess.
 *
 * Whether a booking can be reviewed (it must be `Completed`, not refunded in full, inside the window) is the server's decision,
 * returned as `BookingReviewState.canReview` with a short `reasonCode`. The client never recomputes it.
 */
import type { PagedResult } from '../../../core/http/paged-result.model';
import type { Guid, IsoUtc } from './tutoring-learner.models';

export type ReviewStatus = 'Published' | 'Hidden';
export type ReviewerKind = 'Nickname' | 'Guardian' | 'Anonymous';
export type ReviewerGradeBand = 'Primary' | 'Secondary' | 'Vocational' | 'Other';
export type ReviewSort = 'newest' | 'highest' | 'lowest';

/** Body of `POST` / `PUT /api/tutoring/bookings/{id}/review`. `comment` is plain text (1-1000 characters) or `null`. */
export interface CreateReviewRequest {
  readonly rating: number;
  readonly comment: string | null;
  readonly anonymous: boolean;
}

export type UpdateReviewRequest = CreateReviewRequest;

/** The learner's own review. A `Hidden` review is shown as such, but the reason is never sent to the learner. */
export interface MyReview {
  readonly reviewId: Guid;
  readonly bookingId: Guid;
  readonly rating: number;
  readonly comment: string | null;
  readonly anonymous: boolean;
  readonly status: ReviewStatus;
  readonly createdAtUtc: IsoUtc;
  readonly editedAtUtc: IsoUtc | null;
}

export type ReviewReasonCode = 'booking_not_completed' | 'refunded' | 'window_closed' | 'exists' | 'disabled';

/** `GET bookings/{id}/review`. */
export interface BookingReviewState {
  readonly bookingId: Guid;
  readonly canReview: boolean;
  readonly reasonCode: ReviewReasonCode | null;
  readonly reviewableUntilUtc: IsoUtc | null;
  readonly review: MyReview | null;
  readonly canEdit: boolean;
  readonly editableUntilUtc: IsoUtc | null;
}

// Public review DTOs (GET /api/tutoring/tutors/{slug}/reviews).
export interface PublicReviewer {
  readonly kind: ReviewerKind;
  readonly nickname: string | null;
  readonly gradeBand: ReviewerGradeBand | null;
}

export interface PublicTutorReview {
  readonly reviewId: Guid;
  readonly rating: number;
  readonly comment: string | null;
  readonly reviewer: PublicReviewer;
  readonly subjectNameTh: string;
  readonly subjectNameEn: string;
  readonly createdAtUtc: IsoUtc;
  readonly edited: boolean;
}

export interface RatingDistribution {
  readonly star1: number;
  readonly star2: number;
  readonly star3: number;
  readonly star4: number;
  readonly star5: number;
}

export interface TutorReviewsSummary {
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly distribution: RatingDistribution;
}

export interface TutorReviewsResponse {
  readonly summary: TutorReviewsSummary;
  readonly reviews: PagedResult<PublicTutorReview>;
}

export interface TutorReviewsQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: ReviewSort;
  readonly rating?: number;
}

// Administrator moderation DTOs (GET/POST /api/tutoring/admin/reviews).
export interface AdminReviewListItem {
  readonly reviewId: Guid;
  readonly tutorId: Guid;
  readonly tutorDisplayName: string;
  readonly tutorSlug: string;
  readonly bookingId: Guid;
  readonly bookingNo: string;
  readonly reviewerUserId: Guid;
  readonly rating: number;
  readonly comment: string | null;
  readonly reviewerKind: ReviewerKind;
  readonly reviewerNickname: string | null;
  readonly reviewerGradeBand: ReviewerGradeBand | null;
  readonly status: ReviewStatus;
  readonly hideReason: string | null;
  readonly hiddenByUserId: Guid | null;
  readonly hiddenAtUtc: IsoUtc | null;
  readonly createdAtUtc: IsoUtc;
  readonly editedAtUtc: IsoUtc | null;
  readonly countsTowardRating: boolean;
  readonly redacted: boolean;
}

export interface AdminReviewsQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: ReviewStatus;
  readonly rating?: number;
  readonly tutorId?: Guid;
  readonly search?: string;
}

export interface HideReviewRequest {
  readonly reason: string;
}

export interface UnhideReviewRequest {
  readonly note?: string | null;
}
