import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorX } from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { StudioNavLink } from './studio-nav-link';

/**
 * Slide-in navigation drawer for the instructor / admin shells, whose sidebar is hidden below `md`. The layout owns
 * the trigger button and the `open` state; this component renders the SAME `items` list the sidebar renders, so the
 * two can never drift apart. Mirrors `MobileNav` (public layout) for the a11y mechanics: `CdkTrapFocus` captures focus
 * on open and restores it to the trigger on close, Escape and a backdrop click close it, and following a link closes
 * it. There is no body scroll lock to manage: the studio shells scroll inside `<main>`, never the body.
 */
@Component({
  selector: 'app-studio-mobile-nav',
  imports: [NgIcon, TranslatePipe, CdkTrapFocus, RouterLink, RouterLinkActive, UserAvatar],
  templateUrl: './studio-mobile-nav.html',
  styleUrl: './studio-mobile-nav.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorX })],
})
export class StudioMobileNav {
  /** Two-way: the layout owns the source of truth, this component only ever sets it to `false`. */
  readonly open = model(false);

  /** i18n key of the drawer's heading (also its accessible name). */
  readonly titleKey = input.required<string>();

  /** The primary navigation, identical to the desktop sidebar's list. */
  readonly items = input.required<readonly StudioNavLink[]>();

  /** Header actions that are hidden on small screens (mode switches, create), repeated here so they stay reachable. */
  readonly extraItems = input<readonly StudioNavLink[]>([]);

  /** Id of the dialog panel; the layout's trigger points `aria-controls` at it. */
  readonly panelId = input('studio-mobile-nav-panel');

  protected readonly auth = inject(AuthService);

  protected readonly titleId = 'studio-mobile-nav-title';

  protected requestClose(): void {
    this.open.set(false);
  }

  protected onOverlayClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    this.requestClose();
  }
}
