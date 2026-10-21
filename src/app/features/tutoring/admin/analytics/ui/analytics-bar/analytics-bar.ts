import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AnalyticsBarTone = 'primary' | 'green' | 'blue' | 'orange' | 'red';

const FILL: Readonly<Record<AnalyticsBarTone, string>> = {
  primary: 'bg-[var(--color-primary)]',
  green: 'tone-green bg-[var(--tone-fg)]',
  blue: 'tone-blue bg-[var(--tone-fg)]',
  orange: 'tone-orange bg-[var(--tone-fg)]',
  red: 'tone-red bg-[var(--tone-fg)]',
};

/**
 * A horizontal bar whose length is `percent` (0 to 100) of its track. Pure decoration (`aria-hidden`): whatever it shows is also written as
 * a number next to it, so meaning never rests on length or colour alone. No chart library; the width is a plain style (never animated).
 */
@Component({
  selector: 'app-analytics-bar',
  template: `<div class="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
    <div class="h-full rounded-full" [class]="fill()" [style.width.%]="percent()"></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-16' },
})
export class AnalyticsBar {
  readonly percent = input.required<number>();
  readonly tone = input<AnalyticsBarTone>('primary');

  protected readonly fill = computed(() => FILL[this.tone()]);
}
