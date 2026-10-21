import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { AdminAnalyticsApiService } from '../../data/admin-analytics-api.service';
import type { KycAgingReport as KycAging } from '../../data/admin-analytics.models';
import { percentOf } from '../../data/admin-analytics.util';
import { injectAnalyticsReport } from '../analytics-report';
import { AnalyticsBar, type AnalyticsBarTone } from '../ui/analytics-bar/analytics-bar';
import { AnalyticsReportFrame } from '../ui/analytics-report-frame/analytics-report-frame';
import { KpiTile } from '../ui/kpi-tile/kpi-tile';

interface AgeBand {
  readonly key: keyof KycAging['ageBuckets'];
  readonly tone: AnalyticsBarTone;
}

/** Waiting-time bands of the identity checks an administrator still has to do, youngest first; the oldest are the ones to look at. */
const AGE_BANDS: readonly AgeBand[] = [
  { key: 'lt24h', tone: 'green' },
  { key: 'h24to48', tone: 'blue' },
  { key: 'h48to72', tone: 'orange' },
  { key: 'gt72h', tone: 'red' },
];

/**
 * "Identity check queue" tab (P13-15 section 4.6): how many tutor identity checks are waiting for an administrator, how long they have been
 * waiting (in bands), what is waiting for the tutor instead, and how fast the last 30 days of decisions were. It only counts: no applicant, no
 * document and no name appears. The bars are each band's share of the checks waiting for an administrator; the count is written beside each.
 */
@Component({
  selector: 'app-kyc-aging-report',
  imports: [DecimalPipe, RouterLink, TranslatePipe, BangkokDatePipe, AnalyticsBar, AnalyticsReportFrame, KpiTile],
  templateUrl: './kyc-aging-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class KycAgingReport {
  private readonly api = inject(AdminAnalyticsApiService);
  protected readonly state = injectAnalyticsReport({
    params: () => true,
    load: () => this.api.getKycAging(),
  });

  protected readonly bands = AGE_BANDS;
  protected readonly percentOf = percentOf;
}
