import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArticle,
  phosphorChalkboardTeacher,
  phosphorCreditCard,
  phosphorCurrencyCircleDollar,
  phosphorCurrencyDollar,
  phosphorEnvelopeSimple,
  phosphorGraduationCap,
  phosphorHouse,
  phosphorIdentificationCard,
  phosphorImage,
  phosphorList,
  phosphorPulse,
  phosphorSignOut,
  phosphorTag,
  phosphorTreeStructure,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';
import { StudioMobileNav } from '../studio-mobile-nav/studio-mobile-nav';
import { ADMIN_NAV_LINKS, ADMIN_SWITCH_LINKS } from './admin-nav';

@Component({
  selector: 'app-admin-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NgIcon, TranslatePipe, UserAvatar, StudioMobileNav, ThemeToggle],
  templateUrl: './admin-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorHouse,
      phosphorGraduationCap,
      phosphorChalkboardTeacher,
      phosphorTreeStructure,
      phosphorIdentificationCard,
      phosphorUsers,
      phosphorTag,
      phosphorImage,
      phosphorList,
      phosphorPulse,
      phosphorArticle,
      phosphorCurrencyDollar,
      phosphorCreditCard,
      phosphorCurrencyCircleDollar,
      phosphorEnvelopeSimple,
      phosphorSignOut,
    }),
  ],
})
export class AdminLayout {
  protected readonly auth = inject(AuthService);

  /** The sidebar and the mobile drawer both render this one list. */
  protected readonly navLinks = ADMIN_NAV_LINKS;

  /** Header actions that are hidden on small screens, repeated in the drawer so they stay reachable. */
  protected readonly switchLinks = ADMIN_SWITCH_LINKS;

  /** Below `md` the sidebar is hidden; this opens the drawer that carries the same entries. */
  protected readonly menuOpen = signal(false);
}
