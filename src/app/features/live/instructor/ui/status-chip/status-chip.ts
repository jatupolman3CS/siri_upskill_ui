import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBroadcast,
  phosphorCalendarBlank,
  phosphorCheckCircle,
  phosphorCircleDashed,
  phosphorHourglass,
  phosphorLinkSimple,
  phosphorPlugs,
  phosphorProhibit,
  phosphorWarningCircle,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import type { StatusTone, StatusView } from '../../../data/live-instructor.util';

const TONE_STYLES: Record<StatusTone, { readonly surface: string; readonly icon: string }> = {
  neutral: {
    surface: 'border-[var(--color-border)] bg-[var(--color-surface-muted)]',
    icon: 'text-[var(--color-text-muted)]',
  },
  info: {
    surface:
      'border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]',
    icon: 'text-[var(--color-primary-text)]',
  },
  success: {
    surface: 'tone-green border-[var(--tone-fg)]/40 bg-[var(--tone-bg)]',
    icon: 'text-[var(--tone-fg)]',
  },
  warning: {
    surface: 'tone-gold border-[var(--tone-fg)]/45 bg-[var(--tone-bg)]',
    icon: 'text-[var(--tone-fg)]',
  },
  danger: {
    surface: 'tone-red border-[var(--tone-fg)]/40 bg-[var(--tone-bg)]',
    icon: 'text-[var(--tone-fg)]',
  },
};

/**
 * Generic status chip (room status, course status): an icon AND a text label, with a tint — meaning is never carried by colour alone (ui-design.md). The label
 * text itself is always `--color-text`, so contrast does not depend on the tint behind it.
 */
@Component({
  selector: 'app-status-chip',
  imports: [NgIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorBroadcast,
      phosphorCalendarBlank,
      phosphorCheckCircle,
      phosphorCircleDashed,
      phosphorHourglass,
      phosphorLinkSimple,
      phosphorPlugs,
      phosphorProhibit,
      phosphorWarningCircle,
      phosphorXCircle,
    }),
  ],
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-1 text-xs font-semibold text-[var(--color-text)]"
      [class]="styles().surface"
    >
      <ng-icon [name]="view().icon" aria-hidden="true" class="shrink-0 text-sm" [class]="styles().icon" />
      <span>{{ view().labelKey | translate }}</span>
    </span>
  `,
})
export class StatusChip {
  readonly view = input.required<StatusView>();

  protected readonly styles = computed(() => TONE_STYLES[this.view().tone]);
}
