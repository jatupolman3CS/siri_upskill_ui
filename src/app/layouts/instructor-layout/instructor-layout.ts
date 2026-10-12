import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorBookOpen,
  phosphorChartBar,
  phosphorCurrencyDollar,
  phosphorGoogleLogo,
  phosphorGraduationCap,
  phosphorHouse,
  phosphorList,
  phosphorMegaphone,
  phosphorPlusCircle,
  phosphorSignOut,
  phosphorVideoCamera,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';
import { StudioMobileNav } from '../studio-mobile-nav/studio-mobile-nav';
import { StudioNavLink } from '../studio-mobile-nav/studio-nav-link';
import { INSTRUCTOR_ADMIN_SWITCH_LINK, INSTRUCTOR_NAV_LINKS, INSTRUCTOR_SWITCH_LINKS } from './instructor-nav';

@Component({
  selector: 'app-instructor-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NgIcon, TranslatePipe, UserAvatar, StudioMobileNav, ThemeToggle],
  templateUrl: './instructor-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorHouse,
      phosphorBookOpen,
      phosphorChartBar,
      phosphorCurrencyDollar,
      phosphorGoogleLogo,
      phosphorGraduationCap,
      phosphorList,
      phosphorMegaphone,
      phosphorPlusCircle,
      phosphorVideoCamera,
      phosphorArrowLeft,
      phosphorSignOut,
    }),
  ],
})
export class InstructorLayout {
  protected readonly auth = inject(AuthService);

  /** The sidebar and the mobile drawer both render this one list. */
  protected readonly navLinks = INSTRUCTOR_NAV_LINKS;

  /** Below `md` the sidebar is hidden; this opens the drawer that carries the same entries. */
  protected readonly menuOpen = signal(false);

  /** Header actions that are hidden on small screens, repeated in the drawer so they stay reachable. */
  protected readonly switchLinks = computed<readonly StudioNavLink[]>(() =>
    this.auth.isAdmin() ? [INSTRUCTOR_ADMIN_SWITCH_LINK, ...INSTRUCTOR_SWITCH_LINKS] : INSTRUCTOR_SWITCH_LINKS,
  );
}
