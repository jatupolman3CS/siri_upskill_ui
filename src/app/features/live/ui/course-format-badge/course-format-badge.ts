import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorBroadcast } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { DeliveryFormat } from '../../data/live.models';

/**
 * "Live" / "Hybrid" marker for a course card. Renders nothing for an on-demand course (or when the API sent no format), so
 * the card of a plain video course is unchanged. Solid surface + text + icon: it sits on top of a thumbnail, where a tint
 * alone would not guarantee contrast.
 */
@Component({
  selector: 'app-course-format-badge',
  imports: [NgIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorBroadcast })],
  host: { class: 'inline-flex' },
  template: `
    @if (isLive()) {
      <span
        class="inline-flex items-center gap-1 rounded-[var(--radius-full)] glass-card px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)]"
      >
        <ng-icon name="phosphorBroadcast" aria-hidden="true" class="text-sm text-[var(--color-primary-text)]" />
        {{ 'live.catalog.badge.' + format() | translate }}
      </span>
    }
  `,
})
export class CourseFormatBadge {
  readonly format = input<DeliveryFormat | undefined>(undefined);

  protected readonly isLive = computed(() => this.format() === 'Live' || this.format() === 'Hybrid');
}
