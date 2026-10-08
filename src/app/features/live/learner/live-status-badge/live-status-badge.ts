import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBroadcast,
  phosphorCheckCircle,
  phosphorClock,
  phosphorProhibit,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { LiveDisplayState } from '../../data/live.models';

interface BadgeStyle {
  readonly icon: string;
  readonly labelKey: string;
  /** Tinted surface + border carry the state; the text stays `--color-text` so contrast never depends on the tint. */
  readonly surface: string;
  readonly iconTone: string;
}

const STYLES: Readonly<Record<LiveDisplayState, BadgeStyle>> = {
  Upcoming: {
    icon: 'phosphorClock',
    labelKey: 'live.status.upcoming',
    surface: 'border-[var(--color-border)] bg-[var(--color-surface-muted)]',
    iconTone: 'text-[var(--color-primary)]',
  },
  Live: {
    icon: 'phosphorBroadcast',
    labelKey: 'live.status.live',
    surface:
      'border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_14%,var(--color-bg))]',
    iconTone: 'text-[var(--color-success)]',
  },
  Ended: {
    icon: 'phosphorCheckCircle',
    labelKey: 'live.status.ended',
    surface: 'border-[var(--color-border)] bg-[var(--color-surface)]',
    iconTone: 'text-[var(--color-text-muted)]',
  },
  Cancelled: {
    icon: 'phosphorProhibit',
    labelKey: 'live.status.cancelled',
    surface:
      'border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-bg))]',
    iconTone: 'text-[var(--color-danger)]',
  },
};

/**
 * Session state chip: always an icon **and** a text label, so the state never relies on colour alone
 * (ui-design.md). It is deliberately not a live region — a page full of badges announcing themselves would compete with
 * the one status message a screen is meant to announce.
 */
@Component({
  selector: 'app-live-status-badge',
  imports: [NgIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorBroadcast, phosphorCheckCircle, phosphorClock, phosphorProhibit })],
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-1 text-xs font-semibold text-[var(--color-text)]"
      [class]="style().surface"
    >
      <ng-icon [name]="style().icon" aria-hidden="true" class="h-4 w-4 shrink-0" [class]="style().iconTone" />
      <span>{{ style().labelKey | translate }}</span>
    </span>
  `,
})
export class LiveStatusBadge {
  readonly state = input.required<LiveDisplayState>();

  protected readonly style = computed(() => STYLES[this.state()]);
}
