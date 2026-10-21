import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { AdminAnalyticsApiService } from '../../data/admin-analytics-api.service';
import type { AnalyticsGranularity, LocalDate } from '../../data/admin-analytics.models';
import { bucketInstant, maxAbsOf, percentOf } from '../../data/admin-analytics.util';
import { injectAnalyticsReport } from '../analytics-report';
import { AnalyticsBar } from '../ui/analytics-bar/analytics-bar';
import { AnalyticsReportFrame } from '../ui/analytics-report-frame/analytics-report-frame';

/** The explanations the server may attach to a revenue report; any other code is left out rather than shown raw. */
const KNOWN_NOTES: ReadonlySet<string> = new Set([
  'package_timing',
  'ledger_excludes_fully_refunded_before_batch',
  'fee_may_be_estimate',
  'cash_vs_ledger_not_comparable_per_bucket',
]);

/**
 * "Revenue" tab (P13-15 section 4.1). Two different measurements are shown as two separate cards and are never added together or
 * subtracted from one another here: the cash that actually moved (payments that succeeded, refunds that completed) and the revenue the ledger
 * recognised after refunds (what the platform keeps as commission and what is payable to tutors). Each has its own totals and, per
 * day / week / month, its own table with a bar for the figure that matters most. Every number is the server's; a bar is only a share of the
 * largest value in its table, and the number is always written next to it. A cash net below zero in one bucket is normal (a refund of an
 * earlier period) and is shown with its minus sign.
 */
@Component({
  selector: 'app-revenue-report',
  imports: [DecimalPipe, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, AnalyticsBar, AnalyticsReportFrame],
  templateUrl: './revenue-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'block min-w-0' },
})
export class RevenueReport {
  readonly from = input.required<LocalDate>();
  readonly to = input.required<LocalDate>();
  readonly granularity = input.required<AnalyticsGranularity>();

  private readonly api = inject(AdminAnalyticsApiService);
  protected readonly state = injectAnalyticsReport({
    params: () => ({ from: this.from(), to: this.to(), granularity: this.granularity() }),
    load: (query) => this.api.getRevenue(query),
  });

  protected readonly notes = computed(() => (this.state.report()?.notes ?? []).filter((code) => KNOWN_NOTES.has(code)));
  /** Scales of the two bar columns: the largest net-collected and the largest platform-commission value in view. */
  protected readonly cashScale = computed(() => maxAbsOf((this.state.report()?.buckets ?? []).map((bucket) => bucket.netCollectedAmount)));
  protected readonly ledgerScale = computed(() => maxAbsOf((this.state.report()?.buckets ?? []).map((bucket) => bucket.platformCommissionAmount)));
  protected readonly dateFormat = computed(() => (this.state.report()?.granularity === 'Month' ? 'month' : 'date'));
  protected readonly isWeekly = computed(() => this.state.report()?.granularity === 'Week');

  protected readonly instantOf = bucketInstant;
  protected readonly percentOf = percentOf;
}
