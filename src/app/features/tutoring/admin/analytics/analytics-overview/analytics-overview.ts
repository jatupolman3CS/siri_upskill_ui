import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { AdminAnalyticsApiService } from '../../data/admin-analytics-api.service';
import { formatPercent, monthLabel } from '../../data/admin-analytics.util';
import { injectAnalyticsReport } from '../analytics-report';
import { AnalyticsReportFrame } from '../ui/analytics-report-frame/analytics-report-frame';
import { KpiTile } from '../ui/kpi-tile/kpi-tile';

/**
 * The number tiles at the top of the analytics screen (P13-15 section 4.7): the last 30 days at a glance, the newest retention figure that is
 * old enough to mean something, and the queues that need an administrator (identity checks, disputes). The server builds them from its other
 * reports; this only lays them out. A figure the server could not give - a rate with nothing to divide, a cohort too small - reads "-" with the
 * reason in the hint, never 0. The most searched subject is named in Thai because that is the only name the overview carries.
 */
@Component({
  selector: 'app-analytics-overview',
  imports: [DecimalPipe, RouterLink, TranslatePipe, CurrencyThbPipe, AnalyticsReportFrame, KpiTile],
  templateUrl: './analytics-overview.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'block min-w-0' },
})
export class AnalyticsOverviewPanel {
  private readonly api = inject(AdminAnalyticsApiService);
  private readonly i18n = inject(TranslationService);
  protected readonly state = injectAnalyticsReport({
    params: () => true,
    load: () => this.api.getOverview(),
  });

  /** The language is read here so the month name follows the TH / EN toggle. */
  protected readonly locale = computed(() => this.i18n.locale());
  protected readonly rateText = formatPercent;

  protected monthText(month: string): string {
    return monthLabel(month, this.locale());
  }
}
