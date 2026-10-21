import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One number with its name, for the rows of tiles at the top of the analytics screen. `value` is already formatted text (a money amount, a
 * count, a rate or "-" for "not enough data"); `hint` is an optional second line. Read in order, a screen reader hears "label, value, hint".
 */
@Component({
  selector: 'app-kpi-tile',
  template: `<div class="glass-card flex h-full flex-col items-start gap-1 rounded-[var(--radius-lg)] p-4">
    <p class="text-sm text-[var(--color-text-muted)]">{{ label() }}</p>
    <p class="break-words text-2xl font-bold text-[var(--color-text)]">{{ value() }}</p>
    @if (hint(); as note) {
      <p class="text-sm text-[var(--color-text-muted)]">{{ note }}</p>
    }
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class KpiTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string | null>(null);
}
