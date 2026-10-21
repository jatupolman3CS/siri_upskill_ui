import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { localizedName } from '../../../data/tutoring-labels';
import { AdminAnalyticsApiService } from '../../data/admin-analytics-api.service';
import type { LocalDate, SearchSubjectDemand } from '../../data/admin-analytics.models';
import { bucketInstant, formatPercent, maxAbsOf, percentOf } from '../../data/admin-analytics.util';
import { injectAnalyticsReport } from '../analytics-report';
import { AnalyticsBar } from '../ui/analytics-bar/analytics-bar';
import { AnalyticsReportFrame } from '../ui/analytics-report-frame/analytics-report-frame';
import { KpiTile } from '../ui/kpi-tile/kpi-tile';

/**
 * "What people search for" tab (P13-15 section 4.2): which subjects are searched most, how often a search found no tutor at all (unmet
 * demand), and the most common search texts. Privacy is the server's: a subject with too few searches is not listed (its searches are only
 * counted in "hidden"), and a search text below the server's threshold is not listed either. When nothing is listed but some searches were
 * hidden, the tab says exactly that - "not enough data" - instead of showing an empty table that reads like "nobody searched". Search texts are
 * plain text and are only ever interpolated, never rendered as HTML.
 */
@Component({
  selector: 'app-search-demand-report',
  imports: [DecimalPipe, TranslatePipe, BangkokDatePipe, AnalyticsBar, AnalyticsReportFrame, KpiTile],
  templateUrl: './search-demand-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class SearchDemandReport {
  readonly from = input.required<LocalDate>();
  readonly to = input.required<LocalDate>();
  readonly top = input.required<number>();

  private readonly api = inject(AdminAnalyticsApiService);
  private readonly i18n = inject(TranslationService);
  protected readonly state = injectAnalyticsReport({
    params: () => ({ from: this.from(), to: this.to(), top: this.top() }),
    load: (query) => this.api.getSearchDemand(query),
  });

  protected readonly searchScale = computed(() => maxAbsOf((this.state.report()?.topSubjects ?? []).map((subject) => subject.searchCount)));
  /** Whether the server clamped the start to what it still keeps (search logs are deleted after 90 days). */
  protected readonly startMoved = computed(() => {
    const report = this.state.report();
    return report !== undefined && report.effectiveFrom > this.from();
  });
  /** Searches were made but every group was too small to list: "not enough data", not "nothing". */
  protected readonly allHidden = computed(() => {
    const report = this.state.report();
    return report !== undefined && report.topSubjects.length === 0 && report.suppressedSearchCount > 0;
  });

  protected readonly instantOf = bucketInstant;
  protected readonly percentOf = percentOf;
  protected readonly rateText = formatPercent;

  protected nameOf(subject: SearchSubjectDemand): string {
    return localizedName(subject, this.i18n.locale());
  }
}
