import type {
  AdminReviewListItem,
  PublicTutorReview,
  TutorReviewsResponse,
  TutorReviewsSummary,
} from '../data/tutoring-review.models';

export function publicTutorReview(overrides?: Partial<PublicTutorReview>): PublicTutorReview {
  return {
    reviewId: '11111111-1111-1111-1111-111111111111',
    rating: 5,
    comment: 'Great teaching style and very patient.',
    reviewer: {
      kind: 'Nickname',
      nickname: 'Somchai',
      gradeBand: 'Secondary',
    },
    subjectNameTh: 'Mathematics (TH)',
    subjectNameEn: 'Mathematics',
    createdAtUtc: '2026-03-01T10:00:00Z',
    edited: false,
    ...overrides,
  };
}

export function tutorReviewsSummary(overrides?: Partial<TutorReviewsSummary>): TutorReviewsSummary {
  return {
    ratingAverage: 4.8,
    ratingCount: 15,
    distribution: {
      star5: 12,
      star4: 2,
      star3: 1,
      star2: 0,
      star1: 0,
    },
    ...overrides,
  };
}

export function tutorReviewsResponse(overrides?: Partial<TutorReviewsResponse>): TutorReviewsResponse {
  return {
    summary: tutorReviewsSummary(),
    reviews: {
      items: [publicTutorReview()],
      totalCount: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    },
    ...overrides,
  };
}

export function adminReviewListItem(overrides?: Partial<AdminReviewListItem>): AdminReviewListItem {
  return {
    reviewId: '22222222-2222-2222-2222-222222222222',
    tutorId: '33333333-3333-3333-3333-333333333333',
    tutorDisplayName: 'Nina Tutor',
    tutorSlug: 'nina-tutor',
    bookingId: '44444444-4444-4444-4444-444444444444',
    bookingNo: 'BK-2026-0001',
    reviewerUserId: '55555555-5555-5555-5555-555555555555',
    rating: 5,
    comment: 'Very helpful tutor!',
    reviewerKind: 'Nickname',
    reviewerNickname: 'Somchai',
    reviewerGradeBand: 'Secondary',
    status: 'Published',
    hideReason: null,
    hiddenByUserId: null,
    hiddenAtUtc: null,
    createdAtUtc: '2026-03-01T10:00:00Z',
    editedAtUtc: null,
    countsTowardRating: true,
    redacted: false,
    ...overrides,
  };
}
