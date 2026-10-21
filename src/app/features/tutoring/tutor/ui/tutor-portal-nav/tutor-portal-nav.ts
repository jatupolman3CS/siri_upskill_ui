import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';

interface PortalLink {
  readonly id: string;
  readonly route: string;
  readonly labelKey: string;
  readonly exact: boolean;
}

const LINKS: readonly PortalLink[] = [
  { id: 'hub', route: '/instructor/tutoring', labelKey: 'tutoring.tutor.nav.hub', exact: true },
  { id: 'profile', route: '/instructor/tutoring/profile', labelKey: 'tutoring.tutor.nav.profile', exact: false },
  { id: 'offerings', route: '/instructor/tutoring/offerings', labelKey: 'tutoring.tutor.nav.offerings', exact: false },
  { id: 'credentials', route: '/instructor/tutoring/credentials', labelKey: 'tutoring.tutor.nav.credentials', exact: false },
  { id: 'kyc', route: '/instructor/tutoring/kyc', labelKey: 'tutoring.tutor.nav.kyc', exact: false },
  { id: 'availability', route: '/instructor/tutoring/availability', labelKey: 'tutoring.tutor.nav.availability', exact: false },
  { id: 'classes', route: '/instructor/tutoring/classes', labelKey: 'tutoring.tutor.nav.classes', exact: false },
  { id: 'packages', route: '/instructor/tutoring/packages', labelKey: 'tutoring.tutor.nav.packages', exact: false },
  { id: 'wallet', route: '/instructor/tutoring/wallet', labelKey: 'tutoring.tutor.nav.wallet', exact: false },
  { id: 'disputes', route: '/instructor/tutoring/disputes', labelKey: 'tutoring.tutor.nav.disputes', exact: false },
];

/**
 * Section switcher shown at the top of every Tutor Portal page (the studio sidebar carries a single "Tutoring" entry; this
 * is the second level). Links only, no permission logic: every link is shown, and a screen that needs a verified tutor sends
 * anyone else to the hub, which explains what is missing.
 */
@Component({
  selector: 'app-tutor-portal-nav',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav [attr.aria-label]="'tutoring.tutor.nav.label' | translate" class="flex flex-wrap gap-2">
      @for (link of links; track link.id) {
        <a
          [routerLink]="link.route"
          routerLinkActive="bg-[var(--color-primary)]! text-[var(--color-primary-foreground)]! font-bold"
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: link.exact }"
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
export class TutorPortalNav {
  protected readonly links = LINKS;
}
