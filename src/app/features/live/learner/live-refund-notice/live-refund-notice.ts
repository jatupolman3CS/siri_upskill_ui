import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorInfo } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

/**
 * Heads-up shown before a learner's first entry into a live room: the first join makes the course non-refundable
 * (`P11-12`, Q13.4). Information only — the server enforces the rule and this never blocks anything — it exists so a
 * learner cannot lose the refund right without knowing.
 */
@Component({
  selector: 'app-live-refund-notice',
  imports: [NgIcon, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorInfo })],
  host: { class: 'block' },
  template: `
    <aside
      class="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)]"
    >
      <ng-icon name="phosphorInfo" aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
      <p>
        {{ 'live.refundNotice' | translate }}
        <a
          routerLink="/refund-policy"
          class="font-semibold text-[var(--color-primary)] underline underline-offset-2 hover:text-[var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        >
          {{ 'live.refundPolicyLink' | translate }}
        </a>
      </p>
    </aside>
  `,
})
export class LiveRefundNotice {}
