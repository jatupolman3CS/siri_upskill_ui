import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import type { Guid } from '../../../data/tutoring-learner.models';
import { TutoringLearnerApiService } from '../../../data/tutoring-learner-api.service';
import type { BookingSummaryDto } from '../../../data/tutoring-my-bookings.models';

/**
 * What the tutor wrote after the class (P13-10 section 6.2): what was covered, how the learner did, the homework and what comes
 * next. Read only. The texts are plain text from another person, so they are rendered as text (`{{ }}`, never as HTML) with line
 * breaks kept. Until the tutor has written a summary the server answers `404`, which here simply means "not yet" and is not an
 * error.
 */
@Component({
  selector: 'app-booking-summary-section',
  imports: [TranslatePipe, BangkokDatePipe, Button, Skeleton],
  templateUrl: './booking-summary-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class BookingSummarySection {
  private readonly api = inject(TutoringLearnerApiService);

  readonly bookingId = input.required<Guid>();

  private readonly summaryResource = rxResource({
    params: () => this.bookingId(),
    stream: ({ params }) => this.api.getBookingSummary(params),
  });
  protected readonly summary = computed<BookingSummaryDto | null>(() => (this.summaryResource.hasValue() ? this.summaryResource.value() : null));
  protected readonly isLoading = computed(() => this.summaryResource.isLoading() && !this.summaryResource.hasValue());
  protected readonly notWrittenYet = computed(() => {
    const error: unknown = this.summaryResource.error();
    return this.summaryResource.status() === 'error' && error instanceof ApiError && error.status === 404;
  });
  protected readonly hasError = computed(() => this.summaryResource.status() === 'error' && !this.notWrittenYet());

  protected reload(): void {
    this.summaryResource.reload();
  }
}
