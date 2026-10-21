import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

interface SectionLink {
  readonly id: string;
  readonly route: string;
  readonly labelKey: string;
}

const LINKS: readonly SectionLink[] = [
  { id: 'kyc', route: '/admin/tutoring/kyc', labelKey: 'tutoring.admin.nav.kyc' },
  { id: 'tutors', route: '/admin/tutoring/tutors', labelKey: 'tutoring.admin.nav.tutors' },
  { id: 'subjects', route: '/admin/tutoring/subjects', labelKey: 'tutoring.admin.nav.subjects' },
  { id: 'disputes', route: '/admin/tutoring/disputes', labelKey: 'tutoring.admin.nav.disputes' },
  { id: 'analytics', route: '/admin/tutoring/analytics', labelKey: 'tutoring.admin.nav.analytics' },
  { id: 'reviews', route: '/admin/tutoring/reviews', labelKey: 'tutoring.admin.nav.reviews' },
];

/**
 * The second-level switcher at the top of every administrator tutoring page (the sidebar carries one entry per area; the
 * subject catalogue lives under "Tutors"). Links only - the API's `AdminOnly` policy is the gate, the route's `roleGuard` the courtesy.
 */
@Component({
  selector: 'app-admin-tutoring-nav',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav [attr.aria-label]="'tutoring.admin.nav.label' | translate" class="flex flex-wrap gap-2">
      @for (link of links; track link.id) {
        <a
          [routerLink]="link.route"
          routerLinkActive="bg-[var(--color-primary)]! text-[var(--color-primary-foreground)]! font-bold"
          ariaCurrentWhenActive="page"
          class="glass-pill inline-flex min-h-11 items-center rounded-[var(--radius-full)] px-4 text-sm font-semibold text-[var(--color-text)] transition-colors
            hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        >
          {{ link.labelKey | translate }}
        </a>
      }
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AdminTutoringNav {
  protected readonly links = LINKS;
}
