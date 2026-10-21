import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { AdminAnalyticsApiService } from '../../data/admin-analytics-api.service';
import type { FunnelCounts, FunnelSegment, LocalDate } from '../../data/admin-analytics.models';
import { bucketInstant, percentOf } from '../../data/admin-analytics.util';
import { injectAnalyticsReport } from '../analytics-report';
import { AnalyticsBar, type AnalyticsBarTone } from '../ui/analytics-bar/analytics-bar';
import { AnalyticsReportFrame } from '../ui/analytics-report-frame/analytics-report-frame';
import { RateCell } from '../ui/rate-cell/rate-cell';

interface FunnelGroup {
  readonly id: string;
  readonly rows: readonly { readonly key: keyof FunnelCounts; readonly tone: AnalyticsBarTone }[];
}

/** The counts in the order a booking lives them: before payment, after payment, how the lesson ended, and the problems. */
const GROUPS: readonly FunnelGroup[] = [
  {
    id: 'beforePayment',
    rows: [
      { key: 'created', tone: 'primary' },
      { key: 'stillPending', tone: 'blue' },
      { key: 'expired', tone: 'orange' },
      { key: 'abandonedByLearner', tone: 'orange' },
    ],
  },
  {
    id: 'afterPayment',
    rows: [
      { key: 'everConfirmed', tone: 'green' },
      { key: 'stillConfirmed', tone: 'blue' },
      { key: 'settled', tone: 'primary' },
    ],
  },
  {
    id: 'outcome',
    rows: [
      { key: 'completed', tone: 'green' },
      { key: 'noShowLearner', tone: 'orange' },
      { key: 'noShowTutor', tone: 'orange' },
      { key: 'noShowBoth', tone: 'orange' },
      { key: 'cancelledByLearnerAfterConfirm', tone: 'orange' },
      { key: 'cancelledByTutorAfterConfirm', tone: 'orange' },
    ],
  },
  {
    id: 'problems',
    rows: [
      { key: 'inDispute', tone: 'red' },
      { key: 'withDispute', tone: 'red' },
    ],
  },
];

const KNOWN_RATES: ReadonlySet<string> = new Set([
  'holdConversionRate',
  'completionRate',
  'noShowLearnerRate',
  'noShowTutorRate',
  'noShowBothRate',
  'cancelAfterConfirmLearnerRate',
  'cancelAfterConfirmTutorRate',
  'disputeRate',
]);

/**
 * "Booking funnel" tab (P13-15 section 4.4): of the bookings made in the period, where they ended up - not paid, paid and still to come,
 * completed, missed, cancelled, disputed - and the rates the server derived from them (each with the count it is out of, so a rate is never
 * a mystery). The bars are each count's share of the bookings created in the period; the count is always written beside it. The groups are
 * by the booking's CURRENT state, so a recent period is still moving. Rates the server could not compute (nothing to divide by) show as "not
 * enough data", not as zero.
 */
@Component({
  selector: 'app-funnel-report',
  imports: [DecimalPipe, TranslatePipe, BangkokDatePipe, AnalyticsBar, AnalyticsReportFrame, RateCell],
  templateUrl: './funnel-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class FunnelReport {
  readonly from = input.required<LocalDate>();
  readonly to = input.required<LocalDate>();
  readonly segment = input.required<FunnelSegment>();

  private readonly api = inject(AdminAnalyticsApiService);
  protected readonly state = injectAnalyticsReport({
    params: () => ({ from: this.from(), to: this.to(), segment: this.segment() }),
    load: (query) => this.api.getFunnel(query),
  });

  protected readonly groups = GROUPS;
  /** Only the rates the screen knows how to word; any other key is left out rather than shown as an unlabelled number. */
  protected readonly rates = computed(() => (this.state.report()?.rates ?? []).filter((rate) => KNOWN_RATES.has(rate.key)));

  protected readonly instantOf = bucketInstant;
  protected readonly percentOf = percentOf;
}
