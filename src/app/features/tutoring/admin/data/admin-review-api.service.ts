import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import type { PagedResult } from '../../../../core/http/paged-result.model';
import type { Guid } from '../../data/tutoring-learner.models';
import type {
  AdminReviewListItem,
  AdminReviewsQuery,
  HideReviewRequest,
  UnhideReviewRequest,
} from '../../data/tutoring-review.models';

const BASE = '/tutoring/admin/reviews';

/**
 * Tutor reviews moderation (P13-13 section 6 / section 12, `AdminOnly`).
 * Administrators list reviews with filters, hide reviews with a mandatory reason, and unhide them with an optional note.
 */
@Injectable({ providedIn: 'root' })
export class AdminReviewApiService extends ApiService {
  listReviews(query?: AdminReviewsQuery): Observable<PagedResult<AdminReviewListItem>> {
    return this.get<PagedResult<AdminReviewListItem>>(BASE, {
      page: query?.page,
      pageSize: query?.pageSize,
      status: query?.status,
      rating: query?.rating,
      tutorId: query?.tutorId,
      search: query?.search,
    });
  }

  /**
   * Hides a review from public view with an internal reason (mandatory).
   * Atomically recomputes the tutor's rating without this review and writes an audit entry.
   */
  hideReview(reviewId: Guid, request: HideReviewRequest): Observable<void> {
    return this.post<void>(`${BASE}/${encodeURIComponent(reviewId)}/hide`, request);
  }

  /**
   * Restores a previously hidden review to public view.
   * Atomically recomputes the tutor's rating and writes an audit entry.
   */
  unhideReview(reviewId: Guid, request?: UnhideReviewRequest): Observable<void> {
    return this.post<void>(`${BASE}/${encodeURIComponent(reviewId)}/unhide`, request ?? {});
  }
}
