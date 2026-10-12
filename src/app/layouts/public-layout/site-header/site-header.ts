import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorChalkboardTeacher,
  phosphorHeart,
  phosphorList,
  phosphorPackage,
  phosphorShoppingCart,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../../core/auth/auth.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CategoryTreeNode } from '../../../features/catalog/data/category-api.models';
import { CategoryApiService } from '../../../features/catalog/data/category-api.service';
import { WishlistStore } from '../../../features/catalog/data/wishlist.store';
import { CartStore } from '../../../features/commerce/cart/cart-store.service';
import { NotificationBellComponent } from '../../../features/notification/notification-bell/notification-bell.component';
import { BrandLogo } from '../brand-logo/brand-logo';
import { CategoryMegaMenu } from '../category-mega-menu/category-mega-menu';
import { MobileNav } from '../mobile-nav/mobile-nav';
import { SITE_NAV_LINKS } from '../site-nav';
import { HeaderAuth } from './header-auth/header-auth';
import { HeaderIconLink } from './header-icon-link/header-icon-link';
import { HeaderSearch } from './header-search/header-search';
import { LanguageMenu } from './language-menu/language-menu';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';

/**
 * Site header for `PublicLayout`: a slim top strip (tagline + language dropdown), the sticky main row
 * (logo, catalog search, instructor CTA, icon links, account slot) and, from `lg` up, a secondary nav
 * row (Categories mega menu + primary links). Below `lg` the nav lives in the `MobileNav` drawer behind
 * the hamburger, and the search field drops to its own row under the sticky bar.
 * <para>
 * Everything that is not essential for browsing (orders history, devices, privacy, studio/admin, sign
 * out…) lives in the signed-in `AccountMenu` (see `HeaderAuth`) — this header only keeps wishlist,
 * orders, cart and notifications as one-tap icons.
 * </para>
 * <para>
 * `mobileNavOpen` lives here because this header is the only thing that ever opens the drawer.
 * </para>
 */
@Component({
  selector: 'app-site-header',
  imports: [
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    NgIcon,
    MobileNav,
    CategoryMegaMenu,
    NotificationBellComponent,
    BrandLogo,
    HeaderSearch,
    HeaderIconLink,
    HeaderAuth,
    LanguageMenu,
    ThemeToggle,
  ],
  templateUrl: './site-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ phosphorList, phosphorHeart, phosphorPackage, phosphorShoppingCart, phosphorChalkboardTeacher }),
  ],
})
export class SiteHeader {
  protected readonly authService = inject(AuthService);
  protected readonly cartStore = inject(CartStore);
  protected readonly wishlistStore = inject(WishlistStore);
  protected readonly translation = inject(TranslationService);
  private readonly categoryApi = inject(CategoryApiService);

  protected readonly navLinks = SITE_NAV_LINKS;

  /** One fetch, shared by both `CategoryMegaMenu` (desktop) and `MobileNav`'s category accordion
   *  (mobile). `defaultValue: []` only covers the loading/idle period — it does NOT make `.value()` safe
   *  once the resource has settled into an error state (`.value()` throws there regardless), so
   *  template reads go through `categories` below instead of this resource directly. */
  protected readonly categoriesResource = rxResource({
    stream: () => this.categoryApi.getCategoryTree(),
    defaultValue: [] as readonly CategoryTreeNode[],
  });

  /** Guarded read of `categoriesResource` — an empty list while loading or on a fetch error renders as
   *  no categories, a safe, harmless empty state for navigation chrome. */
  protected readonly categories = computed(() =>
    this.categoriesResource.hasValue() ? this.categoriesResource.value() : ([] as readonly CategoryTreeNode[]),
  );

  /** The instructor equivalent of a seller centre: the studio for people who can open it, the
   *  application wizard for everyone else (guests are sent to sign in first by that route's guard). */
  protected readonly instructorCta = computed(() =>
    this.authService.canUseInstructorStudio()
      ? { route: '/instructor', labelKey: 'nav.instructor' }
      : { route: '/become-instructor', labelKey: 'nav.becomeInstructor' },
  );

  protected readonly wishlistLabel = computed(() => this.countLabel('nav.wishlist', 'nav.wishlistCount', this.wishlistStore.count()));
  protected readonly cartLabel = computed(() => this.countLabel('nav.cart', 'nav.cartCount', this.cartStore.itemCount()));
  protected readonly ordersLabel = computed(() => this.translation.t('nav.orders'));

  protected readonly mobileNavOpen = signal(false);
  /** Must match the `id` on mobile-nav.html's dialog panel — referenced by the hamburger's
   *  `aria-controls`. Hardcoded on both sides: `MobileNav` has exactly one call site (here). */
  protected readonly mobileNavPanelId = 'app-mobile-nav-panel';

  private countLabel(plainKey: string, countKey: string, count: number): string {
    return count > 0 ? this.translation.t(countKey, { count }) : this.translation.t(plainKey);
  }
}
