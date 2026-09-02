import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, effect, inject, input, model } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorShoppingCart, phosphorX } from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../../core/auth/auth.service';
import { CartStore } from '../../../features/commerce/cart/cart-store.service';
import { CategoryTreeNode } from '../../../features/catalog/data/category-api.models';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Locale, TranslationService } from '../../../core/i18n/translation.service';
import { CategoryAccordionItem } from './category-accordion-item/category-accordion-item';

/**
 * Mobile slide-in navigation drawer, opened by `SiteHeader`'s hamburger button below the `md`
 * breakpoint. Mirrors `shared/modal/modal.ts`'s a11y mechanics exactly — same `CdkTrapFocus`
 * (auto-capture in, auto-restore focus to the trigger on close), same SSR-safe body-scroll-lock
 * `effect()`, same Escape/overlay-click-to-close (`event.target !== event.currentTarget` check) — see
 * that file's doc comment for why each piece works the way it does. This is a separate component
 * rather than a reuse of `Modal` because a side drawer is a different visual shape (slide from the
 * edge, full height, closes on nav-link click too) than Modal is designed for; `Modal` itself is not
 * touched by this.
 * <para>
 * Injects `AuthService`/`TranslationService`/`Router` directly instead of taking them as inputs from
 * `SiteHeader` — keeps this component independently testable and independently correct if it's ever
 * opened from somewhere other than `SiteHeader`.
 * </para>
 */
@Component({
  selector: 'app-mobile-nav',
  imports: [NgIcon, TranslatePipe, CdkTrapFocus, RouterLink, RouterLinkActive, CategoryAccordionItem],
  templateUrl: './mobile-nav.html',
  styleUrl: './mobile-nav.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorX, phosphorShoppingCart })],
})
export class MobileNav {
  /** Two-way: `SiteHeader` owns the source of truth, this component only ever sets it to `false`. */
  readonly open = model(false);

  /** Task P1-20 — sourced from `SiteHeader`'s own `rxResource` fetch (one fetch shared with
   *  `CategoryMegaMenu`, not refetched here) rather than this component fetching it independently. */
  readonly categories = input.required<readonly CategoryTreeNode[]>();

  protected readonly authService = inject(AuthService);
  protected readonly cartStore = inject(CartStore);
  protected readonly translation = inject(TranslationService);
  private readonly router = inject(Router);

  protected readonly titleId = 'app-mobile-nav-title';

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** `null` = scroll is not currently locked by this drawer instance. */
  private previousBodyOverflow: string | null = null;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      if (!this.isBrowser) {
        return;
      }
      if (isOpen && this.previousBodyOverflow === null) {
        this.previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      } else if (!isOpen && this.previousBodyOverflow !== null) {
        document.body.style.overflow = this.previousBodyOverflow;
        this.previousBodyOverflow = null;
      }
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.isBrowser && this.previousBodyOverflow !== null) {
        document.body.style.overflow = this.previousBodyOverflow;
      }
    });
  }

  protected requestClose(): void {
    this.open.set(false);
  }

  protected onOverlayClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    this.requestClose();
  }

  protected setLocale(locale: Locale): void {
    this.translation.setLocale(locale);
  }

  /** UI wiring of `AuthService.signOut()` — clears session and revokes server cookie */
  protected signOut(): void {
    this.authService.signOut().subscribe();
    this.requestClose();
    void this.router.navigateByUrl('/');
  }
}
