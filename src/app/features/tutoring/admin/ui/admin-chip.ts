import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCheckCircle,
  phosphorCircleDashed,
  phosphorClock,
  phosphorFlag,
  phosphorHourglass,
  phosphorMagnifyingGlass,
  phosphorProhibit,
  phosphorWarningCircle,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { StatusTone, StatusView } from '../../../live/data/live-instructor.util';

const TONE_STYLES: Record<StatusTone, { readonly surface: string; readonly icon: string }> = {
  neutral: { surface: 'border-[var(--color-border)] bg-[var(--color-surface-muted)]', icon: 'text-[var(--color-text-muted)]' },
  info: { surface: 'tone-blue border-[var(--tone-fg)]/40 bg-[var(--tone-bg)]', icon: 'text-[var(--tone-fg)]' },
  success: { surface: 'tone-green border-[var(--tone-fg)]/40 bg-[var(--tone-bg)]', icon: 'text-[var(--tone-fg)]' },
  warning: { surface: 'tone-gold border-[var(--tone-fg)]/45 bg-[var(--tone-bg)]', icon: 'text-[var(--tone-fg)]' },
  danger: { surface: 'tone-red border-[var(--tone-fg)]/40 bg-[var(--tone-bg)]', icon: 'text-[var(--tone-fg)]' },
};

/**
 * A small status pill for the administrator tables and headers: an icon AND a text label on a tint, so meaning never rests on
 * colour alone (ui-design.md). The label is always `--color-text`, so contrast does not depend on the tint behind it. `params`
 * fills a `{{placeholder}}` in the label (e.g. the waiting hours).
 */
@Component({
  selector: 'app-admin-chip',
  imports: [NgIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCheckCircle,
      phosphorCircleDashed,
      phosphorClock,
      phosphorFlag,
      phosphorHourglass,
      phosphorMagnifyingGlass,
      phosphorProhibit,
      phosphorWarningCircle,
      phosphorXCircle,
    }),
  ],
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-full)] border px-2.5 py-1 text-xs font-semibold text-[var(--color-text)]"
      [class]="styles().surface"
    >
      <ng-icon [name]="view().icon" aria-hidden="true" class="shrink-0 text-sm" [class]="styles().icon" />
      <span>{{ view().labelKey | translate: params() }}</span>
    </span>
  `,
})
export class AdminChip {
  readonly view = input.required<StatusView>();
  readonly params = input<Readonly<Record<string, string | number>> | undefined>(undefined);

  protected readonly styles = computed(() => TONE_STYLES[this.view().tone]);
}
