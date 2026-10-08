import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBookOpen,
  phosphorCurrencyDollar,
  phosphorStar,
  phosphorTrendDown,
  phosphorTrendUp,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { InstructorDashboardKpis } from '../../analytics/instructor-analytics.service';
import { formatChangePercent, formatRating } from '../dashboard-format';

/**
 * The four headline cards, straight from `kpis`. Nothing is estimated or defaulted here: a missing value renders "—", and
 * "no reviews yet" is said in words rather than shown as a made-up rating.
 */
@Component({
  selector: 'app-dashboard-kpi-cards',
  imports: [DecimalPipe, NgIcon, TranslatePipe, CurrencyThbPipe, BangkokDatePipe],
  templateUrl: './dashboard-kpi-cards.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // CurrencyThbPipe resolves Angular's CurrencyPipe from DI (it is not provided at the root).
  providers: [
    CurrencyPipe,
    provideIcons({ phosphorBookOpen, phosphorCurrencyDollar, phosphorStar, phosphorTrendDown, phosphorTrendUp, phosphorUsers }),
  ],
  host: { class: 'block' },
})
export class DashboardKpiCards {
  readonly kpis = input<InstructorDashboardKpis | null>(null);

  /** `YYYY-MM` -> an instant inside that month so the month name can go through the Bangkok date pipe. */
  protected readonly monthInstant = computed(() => {
    const key = this.kpis()?.periodKey;
    return key ? `${key}-01T00:00:00Z` : null;
  });
  protected readonly change = computed(() => {
    const percent = this.kpis()?.netRevenueChangePercent;
    return percent === null || percent === undefined ? null : { text: formatChangePercent(percent), up: percent >= 0 };
  });
  protected readonly rating = computed(() => {
    const average = this.kpis()?.ratingAverage;
    return average === null || average === undefined ? null : formatRating(average);
  });
}
