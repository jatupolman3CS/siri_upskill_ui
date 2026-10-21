import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { AdminAnalyticsApiService } from '../../data/admin-analytics-api.service';
import { monthLabel } from '../../data/admin-analytics.util';
import { injectAnalyticsReport } from '../analytics-report';
import { AnalyticsReportFrame } from '../ui/analytics-report-frame/analytics-report-frame';
import { RateCell } from '../ui/rate-cell/rate-cell';

/**
 * "Do learners come back?" tab (P13-15 section 4.3). One row per month in which learners finished their first lesson (the
 * cohort), and for each: how many of them booked another lesson within 30 and within 60 days - counting any booking, and counting only paid
 * ones. A cohort that is too recent to have had its 30 or 60 days is left out of that rate's denominator by the server ("eligible"). Rates the
 * server withheld (a cohort smaller than its minimum) show "not enough data", never zero. The "all cohorts" row is the server's own total,
 * not an average of the rows.
 */
@Component({
  selector: 'app-retention-report',
  imports: [DecimalPipe, TranslatePipe, AnalyticsReportFrame, RateCell],
  templateUrl: './retention-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class RetentionReport {
  readonly fromMonth = input.required<string>();
  readonly toMonth = input.required<string>();

  private readonly api = inject(AdminAnalyticsApiService);
  private readonly i18n = inject(TranslationService);
  protected readonly state = injectAnalyticsReport({
    params: () => ({ fromMonth: this.fromMonth(), toMonth: this.toMonth() }),
    load: (query) => this.api.getRetention(query),
  });

  /** The language is read here so the month names follow the TH / EN toggle. */
  protected readonly locale = computed(() => this.i18n.locale());

  protected monthText(month: string): string {
    return monthLabel(month, this.locale());
  }
}
