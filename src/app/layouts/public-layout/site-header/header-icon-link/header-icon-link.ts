import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

/**
 * Round icon-only link for the header (wishlist, orders, cart) with an optional count badge. The
 * registering `provideIcons` for `icon` lives on the host that uses this (SiteHeader). `label` is the
 * accessible name — the badge itself is `aria-hidden` and the count is folded into `label` by the
 * caller (e.g. "Cart (3 items)"), so screen readers never hear a bare number.
 */
@Component({
  selector: 'app-header-icon-link',
  imports: [RouterLink, NgIcon],
  templateUrl: './header-icon-link.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderIconLink {
  readonly route = input.required<string>();
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly count = input(0);

  protected readonly badgeText = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
}
