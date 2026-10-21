import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import type { Guid } from '../../../data/tutoring-learner.models';
import { TutoringReviewApiService } from '../../../data/tutoring-review-api.service';
import type { BookingReviewState } from '../../../data/tutoring-review.models';
import { StarRatingInput } from '../../../ui/star-rating-input/star-rating-input';
import { ReviewForm } from './review-form';

/**
 * The review of a finished lesson (P13-13): write it, see it, or see why it cannot be written. Everything the screen needs to
 * decide - may a review be written now, may this one be edited, until when - comes from `GET bookings/{id}/review`; nothing is
 * worked out here (the booking status, a full refund and the review window are the server's rules). `disabled` (the server has
 * switched reviews off) hides the whole section rather than showing a form that could only fail.
 * A review the server has hidden is shown to its author as hidden, with no reason (the API does not send one).
 */
@Component({
  selector: 'app-review-section',
  imports: [TranslatePipe, BangkokDatePipe, Button, Skeleton, StarRatingInput, ReviewForm],
  templateUrl: './review-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ReviewSection {
  private readonly api = inject(TutoringReviewApiService);

  readonly bookingId = input.required<Guid>();

  private readonly stateResource = rxResource({
    params: () => this.bookingId(),
    stream: ({ params }) => this.api.getReviewState(params),
  });
  protected readonly state = computed<BookingReviewState | null>(() => (this.stateResource.hasValue() ? this.stateResource.value() : null));
  protected readonly isLoading = computed(() => this.stateResource.isLoading() && !this.stateResource.hasValue());
  protected readonly hasError = computed(() => this.stateResource.status() === 'error');
  protected readonly hidden = computed(() => this.state()?.reasonCode === 'disabled' && this.state()?.review === null);

  protected readonly editing = signal(false);

  protected reload(): void {
    this.editing.set(false);
    this.stateResource.reload();
  }
}
