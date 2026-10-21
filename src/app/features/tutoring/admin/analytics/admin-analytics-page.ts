import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { bangkokDateOf } from '../../data/tutor-slots.util';
import {
  type AnalyticsFilters,
  REPORT_TABS,
  type RangeIssue,
  type ReportTab,
  monthIssueOf,
  parseFilters,
  parseTab,
  rangeIssueOf,
  rangeLimitOf,
} from '../data/admin-analytics.util';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { injectUrlFilters } from '../ui/url-filters';
import { AnalyticsControls } from './analytics-controls/analytics-controls';
import { AnalyticsOverviewPanel } from './analytics-overview/analytics-overview';
import { FunnelReport } from './funnel-report/funnel-report';
import { KycAgingReport } from './kyc-aging-report/kyc-aging-report';
import { RetentionReport } from './retention-report/retention-report';
import { RevenueReport } from './revenue-report/revenue-report';
import { SearchDemandReport } from './search-demand-report/search-demand-report';
import { TopTutorsReport } from './top-tutors-report/top-tutors-report';

/**
 * `/admin/tutoring/analytics` (P13-27, `AdminOnly`) - how the marketplace is doing: money (cash and ledger kept apart), what people search for,
 * whether learners come back, where bookings end up, who the busiest tutors are, and how long identity checks wait. A strip of number tiles on top,
 * then one report at a time. The open report, the period and every option live in the address bar (`?tab=revenue&from=2026-09-15&to=2026-10-14`),
 * so Back, a reload and a shared link land on the same view. Defaults: the last 30 days, the last 12 months.
 * <para>
 * Every figure is the server's; this page picks the report, passes the period down and never adds two numbers together. A period in the URL that
 * the server would refuse (wrong order, in the future, longer than the report allows) is explained instead of being sent. No chart library: bars are
 * plain elements, each with its number written beside it.
 * </para>
 */
@Component({
  selector: 'app-admin-analytics-page',
  imports: [
    TranslatePipe,
    AdminTutoringNav,
    AnalyticsControls,
    AnalyticsOverviewPanel,
    RevenueReport,
    SearchDemandReport,
    RetentionReport,
    FunnelReport,
    TopTutorsReport,
    KycAgingReport,
  ],
  templateUrl: './admin-analytics-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAnalyticsPage {
  private readonly urlFilters = injectUrlFilters();
  private readonly i18n = inject(TranslationService);

  /** Today in Thailand; the page is client-rendered only, so the browser clock is available from the start. */
  protected readonly today = bangkokDateOf(Date.now());
  protected readonly tabs = REPORT_TABS;
  protected readonly tab = computed<ReportTab>(() => parseTab(this.urlFilters.get('tab')));
  protected readonly filters = computed<AnalyticsFilters>(() => parseFilters((key) => this.urlFilters.get(key), this.today));

  /** What is wrong with the period in the address bar for the open report, if anything (nothing is requested while it is). */
  protected readonly issue = computed<RangeIssue | null>(() => {
    const tab = this.tab();
    const current = this.filters();
    if (tab === 'retention') {
      return monthIssueOf(current.fromMonth, current.toMonth, this.today);
    }
    if (tab === 'kyc') {
      return null;
    }
    return rangeIssueOf(current.from, current.to, this.today, rangeLimitOf(tab, current.granularity));
  });
  protected readonly issueText = computed(() => {
    const found = this.issue();
    if (found === null) {
      return null;
    }
    return found.code === 'tooLong'
      ? this.i18n.t(`tutoring.admin.analytics.range.tooLong.${found.unit}`, { max: found.max })
      : this.i18n.t(`tutoring.admin.analytics.range.${found.code}`);
  });

  constructor() {
    trackStudioMeta('tutoring.admin.analytics.pageTitle', 'tutoring.admin.analytics.pageDescription', () => '/admin/tutoring/analytics');
  }

  protected chooseTab(next: ReportTab): void {
    if (next !== this.tab()) {
      this.urlFilters.navigate({ tab: next === 'revenue' ? null : next });
    }
  }

  /** Puts the checked controls into the address bar (the page then reads them back). */
  protected apply(patch: Partial<AnalyticsFilters>): void {
    this.urlFilters.navigate({ ...patch });
  }
}
