import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorClock, phosphorProhibit, phosphorSealCheck, phosphorWarning, phosphorXCircle, phosphorPencilSimple } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { tutorStatusLabelKey, tutorStatusTone } from '../../../data/tutoring-tutor-labels';
import type { TutorStatus } from '../../../data/tutoring-tutor.models';

const ICONS: Readonly<Record<TutorStatus, string>> = {
  Draft: 'phosphorPencilSimple',
  PendingVerification: 'phosphorClock',
  NeedsInfo: 'phosphorWarning',
  Verified: 'phosphorSealCheck',
  Rejected: 'phosphorXCircle',
  Suspended: 'phosphorProhibit',
};

/**
 * The tutor's verification status as a chip: icon + words, never colour alone. Display only - the status is the server's.
 */
@Component({
  selector: 'app-tutor-status-badge',
  imports: [NgIcon, TranslatePipe],
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-1 text-xs font-semibold text-[var(--color-text)]"
      [class]="
        tone() ? tone() + ' border-[var(--tone-fg)]/40 bg-[var(--tone-bg)]' : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'
      "
    >
      <ng-icon [name]="icon()" aria-hidden="true" class="text-sm" [class]="tone() ? 'text-[var(--tone-fg)]' : 'text-[var(--color-text-muted)]'" />
      {{ label() | translate }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorClock, phosphorProhibit, phosphorSealCheck, phosphorWarning, phosphorXCircle, phosphorPencilSimple })],
  host: { class: 'inline-block' },
})
export class TutorStatusBadge {
  readonly status = input.required<TutorStatus>();

  protected readonly label = computed(() => tutorStatusLabelKey(this.status()));
  protected readonly tone = computed(() => tutorStatusTone(this.status()));
  protected readonly icon = computed(() => ICONS[this.status()]);
}
