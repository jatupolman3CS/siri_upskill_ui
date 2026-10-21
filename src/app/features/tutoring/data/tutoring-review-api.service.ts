import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { Guid } from './tutoring-learner.models';
import type { BookingReviewState, CreateReviewRequest, MyReview, UpdateReviewRequest } from './tutoring-review.models';

const reviewPath = (bookingId: Guid): string => `/tutoring/bookings/${encodeURIComponent(bookingId)}/review`;

/**
 * The learner's review of one finished lesson (P13-13). One review per booking, written by the owner of the booking only;
 * another learner's booking and a missing one answer the same `404 tutoring.booking_not_found`.
 */
@Injectable({ providedIn: 'root' })
export class TutoringReviewApiService extends ApiService {
  /** Whether the booking can be reviewed now (and why not), plus the learner's own review when there is one. */
  getReviewState(bookingId: Guid): Observable<BookingReviewState> {
    return this.get<BookingReviewState>(reviewPath(bookingId));
  }

  /**
   * 201. `409 tutoring.review_booking_not_completed | review_booking_refunded | review_window_closed | review_exists` (+ `reviewId`),
   * `400 tutoring.text_contains_markup | review_comment_contains_meeting_link | review_comment_contains_contact | review_comment_required`.
   */
  createReview(bookingId: Guid, body: CreateReviewRequest): Observable<MyReview> {
    return this.post<MyReview>(reviewPath(bookingId), body);
  }

  /** Editing is off unless the server says `canEdit`: `409 tutoring.review_edit_disabled | review_edit_window_closed | review_hidden_not_editable`. */
  updateReview(bookingId: Guid, body: UpdateReviewRequest): Observable<MyReview> {
    return this.put<MyReview>(reviewPath(bookingId), body);
  }
}
