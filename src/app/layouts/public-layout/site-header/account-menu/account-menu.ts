import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorSignOut } from '@ng-icons/phosphor-icons/regular';
import { filter } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { MenuNavigation } from '../../../../shared/menu/menu-navigation.directive';
import { UserAvatar } from '../../../../shared/user-avatar/user-avatar';
import { ACCOUNT_MENU_ICONS, buildAccountMenuItems } from './account-menu-items';

/**
 * Signed-in account dropdown in the site header: a round avatar button that opens a `role="menu"` with
 * the account links (`buildAccountMenuItems`) and Sign out. Keyboard-complete per the WAI-ARIA menu
 * button pattern: Enter/Space/ArrowDown on the button open it and focus the first item; Arrow
 * Up/Down/Home/End rove (`MenuNavigation`); Escape closes and returns focus to the button; Tab closes.
 * It also closes on an outside click (full-viewport click catcher *behind* the panel — a sibling, same
 * trick as `CategoryMegaMenu`), on picking an item, and on every route change.
 * <para>
 * The name/email/avatar come from `AuthService.currentUser()` (token roles merged with the `/me`
 * profile). While `/me` is loading or has failed they are simply absent: the avatar falls back to a
 * person glyph and the header block to a generic "My account" label — never an error, never a crash.
 * </para>
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, NgIcon, TranslatePipe, MenuNavigation, UserAvatar],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ ...ACCOUNT_MENU_ICONS, phosphorSignOut })],
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly open = signal(false);
  protected readonly panelId = 'app-account-menu-panel';

  private readonly triggerButton = viewChild<ElementRef<HTMLButtonElement>>('triggerButton');
  private readonly menuNavigation = viewChild(MenuNavigation);

  protected readonly user = this.auth.currentUser;
  protected readonly items = computed(() =>
    buildAccountMenuItems({
      canUseInstructorStudio: this.auth.canUseInstructorStudio(),
      isAdmin: this.auth.isAdmin(),
    }),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.openMenu();
    }
  }

  protected openFromKeyboard(event: Event): void {
    event.preventDefault();
    this.openMenu();
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onEscape(): void {
    if (!this.open()) {
      return;
    }
    this.close();
    this.triggerButton()?.nativeElement.focus();
  }

  protected signOut(): void {
    this.close();
    this.auth.signOut().subscribe();
    void this.router.navigateByUrl('/');
  }

  private openMenu(): void {
    this.open.set(true);
    afterNextRender(() => this.menuNavigation()?.focusFirst(), { injector: this.injector });
  }
}
