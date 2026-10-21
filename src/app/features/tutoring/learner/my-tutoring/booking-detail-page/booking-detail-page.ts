import { CurrencyPipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowLeft } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { MediaUrlPipe } from '../../../../../core/pipes/media-url.pipe';
import { setPageMeta } from '../../../../../core/seo/page-meta';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import { clockOffsetMs } from '../../../../live/learner/live-clock';
import { BangkokTimeRange } from '../../../../live/ui/bangkok-time-range/bangkok-time-range';
import { formatLabelKey, gradeLabelKey, localizedName } from '../../../data/tutoring-labels';
import type { Guid } from '../../../data/tutoring-learner.models';
import { TutoringLearnerApiService } from '../../../data/tutoring-learner-api.service';
import { bookingStatusView, mayHaveRefund } from '../../../data/tutoring-my.util';
import { formatTutorDisplayName } from '../tutor-display-name.util';
import { BookingActions } from '../booking-actions/booking-actions';
import { BookingMaterialsSection } from '../booking-materials-section/booking-materials-section';
import { BookingSummarySection } from '../booking-summary-section/booking-summary-section';
import { DisputeSection } from '../dispute-section/dispute-section';
import { RefundStatus } from '../refund-status/refund-status';
import { ReviewSection } from '../review-section/review-section';

/**
 * `/my-tutoring/bookings/:bookingId` (P13-23, signed-in, client-rendered, `noindex`) - one lesson in full: what it is, what the
 * learner can do with it (pay, join, cancel, confirm), where its money went, and - once it is over - the tutor's summary, the
 * materials, the review and the way to report a problem. Every section is shown only for the statuses where it can mean
 * something and every figure in it is the server's; the sections that read more data load it themselves, so one failing does not
 * take the page down. Another learner's booking and a missing one answer the same `404`, which reads as "not found".
 */
@Component({
  selector: 'app-booking-detail-page',
  imports: [
    RouterLink,
    NgIcon,
    NgOptimizedImage,
    TranslatePipe,
    CurrencyThbPipe,
    MediaUrlPipe,
    Button,
    EmptyState,
    Skeleton,
    StatusChip,
    BangkokTimeRange,
    BookingActions,
    BookingMaterialsSection,
    BookingSummarySection,
    DisputeSection,
    RefundStatus,
    ReviewSection,
  ],
  templateUrl: './booking-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorArrowLeft })],
})
export class BookingDetailPage {
  private readonly api = inject(TutoringLearnerApiService);
  private readonly i18n = inject(TranslationService);
  protected readonly bookingId: Guid = inject(ActivatedRoute).snapshot.paramMap.get('bookingId') ?? '';

  private readonly bookingResource = rxResource({
    params: () => this.bookingId,
    stream: ({ params }) => this.api.getBooking(params),
  });
  protected readonly booking = computed(() => (this.bookingResource.hasValue() ? this.bookingResource.value() : null));
  protected readonly isLoading = computed(() => this.bookingResource.isLoading() && !this.bookingResource.hasValue());
  protected readonly notFound = computed(() => {
    const error: unknown = this.bookingResource.error();
    return this.bookingResource.status() === 'error' && error instanceof ApiError && error.status === 404;
  });
  protected readonly hasError = computed(() => this.bookingResource.status() === 'error' && !this.notFound());

  protected readonly offsetMs = computed(() => {
    const booking = this.booking();
    return booking === null ? 0 : clockOffsetMs(booking.serverTimeUtc);
  });
  protected readonly statusView = computed(() => {
    const booking = this.booking();
    return booking === null ? null : bookingStatusView(booking.status);
  });
  protected readonly subject = computed(() => {
    const offering = this.booking()?.offering;
    return offering === undefined ? '' : localizedName({ nameTh: offering.subjectNameTh, nameEn: offering.subjectNameEn }, this.i18n.locale());
  });
  protected readonly tutorName = computed(() => {
    const booking = this.booking();
    return booking === null ? '' : formatTutorDisplayName(booking.tutor, this.i18n);
  });
  protected readonly initial = computed(() => this.tutorName().trim().charAt(0).toUpperCase());

  protected readonly showRefunds = computed(() => {
    const booking = this.booking();
    return booking !== null && mayHaveRefund(booking, booking.refundedAmount);
  });
  protected readonly showSummary = computed(() => ['Completed', 'Disputed'].includes(this.booking()?.status ?? ''));
  protected readonly showReview = computed(() => this.booking()?.status === 'Completed');
  /** The class the materials belong to (the booking carries its `sessionId`); only a lesson that is, or was, on the calendar has any. */
  protected readonly materialsSessionId = computed(() => {
    const booking = this.booking();
    return booking !== null && ['Confirmed', 'Completed', 'Disputed'].includes(booking.status) ? booking.sessionId : null;
  });

  protected readonly formatKey = formatLabelKey;
  protected readonly gradeKey = gradeLabelKey;

  constructor() {
    setPageMeta({
      title: `${this.i18n.t('tutoring.learner.my.detail.pageTitle')} | ${this.i18n.t('common.appName')}`,
      description: this.i18n.t('tutoring.learner.my.detail.pageDescription'),
      robots: 'noindex',
    });
  }

  protected reload(): void {
    this.bookingResource.reload();
  }
}
