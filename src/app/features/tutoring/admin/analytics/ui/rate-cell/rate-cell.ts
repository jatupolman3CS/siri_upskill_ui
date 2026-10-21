import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { TranslatePipe } from '../../../../../../core/i18n/translate.pipe';
import { formatPercent } from '../../../data/admin-analytics.util';
import { AnalyticsBar, type AnalyticsBarTone } from '../analytics-bar/analytics-bar';

/**
 * One rate with the counts it is made of: "42.5%", "5 of 12" and a bar. A rate of `null` is the server saying the group is too small to
 * report a rate: it reads "-" with the words "not enough data" for a screen reader and for anyone who hovers - never "0%". The number and
 * the counts are the server's; the bar is only the rate drawn.
 */
@Component({
  selector: 'app-rate-cell',
  imports: [TranslatePipe, AnalyticsBar],
  template: `
    @if (text(); as value) {
      <span class="block font-semibold">{{ value }}</span>
      <span class="block text-xs text-[var(--color-text-muted)]">{{ 'tutoring.admin.analytics.rate.counts' | translate: { numerator: numerator(), denominator: denominator() } }}</span>
      <app-analytics-bar [percent]="percent()" [tone]="tone()" />
    } @else {
      <span class="block font-semibold" aria-hidden="true" [attr.title]="'tutoring.admin.analytics.rate.notEnoughData' | translate">-</span>
      <span class="sr-only">{{ 'tutoring.admin.analytics.rate.notEnoughData' | translate }}</span>
      <span class="block text-xs text-[var(--color-text-muted)]">{{ 'tutoring.admin.analytics.rate.counts' | translate: { numerator: numerator(), denominator: denominator() } }}</span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-24' },
})
export class RateCell {
  /** The rate, 0 to 1, or `null` when the server did not report one. */
  readonly rate = input.required<number | null>();
  readonly numerator = input.required<number>();
  readonly denominator = input.required<number>();
  readonly tone = input<AnalyticsBarTone>('primary');

  protected readonly text = computed(() => formatPercent(this.rate()));
  protected readonly percent = computed(() => Math.min(100, Math.max(0, (this.rate() ?? 0) * 100)));
}
