import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { AdminAnalyticsApiService } from '../../data/admin-analytics-api.service';
import type { LocalDate, TopTutorSort } from '../../data/admin-analytics.models';
import { bucketInstant } from '../../data/admin-analytics.util';
import { injectAnalyticsReport } from '../analytics-report';
import { AnalyticsReportFrame } from '../ui/analytics-report-frame/analytics-report-frame';

/** Tutor statuses the shared dictionary has a label for; anything else reads as the raw status the server sent. */
const TUTOR_STATUSES: ReadonlySet<string> = new Set(['Draft', 'PendingVerification', 'NeedsInfo', 'Verified', 'Rejected', 'Suspended']);

/**
 * "Top tutors" tab (P13-15 section 4.5): the tutors with the most completed lessons (or the highest booked value, or the best rating) in the
 * period, with the signals an administrator weighs them by - rating, reliability, penalty points and complaints. Only a tutor's public name and
 * profile link are shown; nothing about their learners. "Booked value" is the price of the completed lessons BEFORE commission and refunds - it
 * is not what the tutor earned, and the screen says so. Ranking by rating lists only tutors with enough reviews, which the server decides.
 */
@Component({
  selector: 'app-top-tutors-report',
  imports: [DecimalPipe, RouterLink, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, AnalyticsReportFrame],
  templateUrl: './top-tutors-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'block min-w-0' },
})
export class TopTutorsReport {
  readonly from = input.required<LocalDate>();
  readonly to = input.required<LocalDate>();
  readonly sort = input.required<TopTutorSort>();
  readonly top = input.required<number>();

  private readonly api = inject(AdminAnalyticsApiService);
  protected readonly state = injectAnalyticsReport({
    params: () => ({ from: this.from(), to: this.to(), sort: this.sort(), top: this.top() }),
    load: (query) => this.api.getTopTutors(query),
  });

  protected readonly isRatingSort = computed(() => this.state.report()?.sort === 'Rating');

  protected readonly instantOf = bucketInstant;

  /** The i18n key of a tutor status, or `null` when the screen has no label for the value the server sent. */
  protected statusKey(status: string): string | null {
    return TUTOR_STATUSES.has(status) ? `tutoring.enums.tutorStatus.${status}` : null;
  }
}
