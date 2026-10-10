import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretDown, phosphorSquaresFour } from '@ng-icons/phosphor-icons/regular';

import { CategoryTreeNode } from '../../../features/catalog/data/category-api.models';
import { CATEGORY_ICONS, resolveCategoryIconName, resolveCategoryTone } from '../../../features/catalog/category-icon';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

/**
 * Desktop mega menu (task P1-20) — a disclosure-navigation trigger in `SiteHeader`'s desktop `<nav>`
 * that reveals a flyout panel of course category columns. Deliberately **not** built as an ARIA
 * `role="menu"`/`menuitem` widget: WAI-ARIA's own Authoring Practices reserve that pattern for
 * application-style menus (a File menu with actions), not site navigation — this panel is just a
 * labelled region containing plain links, so the only load-bearing ARIA here is `aria-expanded` +
 * `aria-controls` on the trigger button, matching the exact shape `SiteHeader`'s own hamburger button
 * already establishes (the one difference: that button's target is a modal dialog, so it also sets
 * `aria-haspopup="dialog"` — this trigger's target is a non-modal flyout, so no `aria-haspopup` is set
 * at all, which is what the APG's own "Disclosure Navigation Menu" example does).
 * <para>
 * Non-modal, unlike `MobileNav`: no `CdkTrapFocus`, no body-scroll-lock, no covering backdrop. Closes
 * on Escape (bubbles up from either the trigger or any focused link inside the panel, since the
 * listener sits on their common wrapper) and on any click outside the panel, via a plain full-viewport
 * click-catcher `<div>` — a sibling of the panel, not its parent, so a click *inside* the panel never
 * reaches the catcher (normal DOM hit-testing already resolves it to the topmost element at that
 * point), unlike `MobileNav`'s overlay+panel parent/child structure which needs an explicit
 * `event.target !== event.currentTarget` check for the same result.
 * </para>
 * <para>
 * Capped at two rendered levels (root category column + its direct children) by deliberate design, not
 * a technical limit — a third flyout-within-a-flyout level is a meaningfully different, more complex
 * interaction pattern (cascading hover/click submenus) that no category in this catalog needs yet (all
 * 3 seeded root categories currently have zero children — see `CatalogSeedData.cs`). The backend
 * itself supports arbitrary depth (`Category.ParentId` self-reference); if a category ever needs a
 * third level, its grandchildren are simply not shown in this flyout — the child item's own link still
 * takes the visitor to a listing that includes them, so nothing is unreachable, just not previewed
 * here.
 * </para>
 */
@Component({
  selector: 'app-category-mega-menu',
  imports: [RouterLink, TranslatePipe, NgIcon],
  templateUrl: './category-mega-menu.html',
  styleUrl: './category-mega-menu.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretDown, phosphorSquaresFour, ...CATEGORY_ICONS })],
})
export class CategoryMegaMenu {
  readonly categories = input.required<readonly CategoryTreeNode[]>();

  protected readonly translation = inject(TranslationService);
  protected readonly open = signal(false);
  protected readonly panelId = 'app-category-mega-menu-panel';

  private readonly triggerButton = viewChild<ElementRef<HTMLButtonElement>>('triggerButton');

  protected readonly resolveIconName = resolveCategoryIconName;
  protected readonly resolveTone = resolveCategoryTone;

  protected categoryName(node: CategoryTreeNode): string {
    return this.translation.locale() === 'th' ? node.nameTh : node.nameEn;
  }

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onEscape(): void {
    this.close();
    this.triggerButton()?.nativeElement.focus();
  }
}
