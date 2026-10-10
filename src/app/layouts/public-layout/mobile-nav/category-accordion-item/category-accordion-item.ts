import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretDown } from '@ng-icons/phosphor-icons/regular';

import { CategoryTreeNode } from '../../../../features/catalog/data/category-api.models';
import { CATEGORY_ICONS, resolveCategoryIconName, resolveCategoryTone } from '../../../../features/catalog/category-icon';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';

/**
 * One row of the mobile drawer's category accordion (task P1-20's "หมวดหมู่หลายชั้น" — multi-level
 * categories), self-imported so it can render its own `category.children` recursively to whatever
 * depth the backend's `Category.ParentId` self-reference actually has — unlike the desktop mega menu
 * (`CategoryMegaMenu`), which deliberately caps at two visual levels, a vertically-scrolling accordion
 * has no equivalent reason to cap depth: one more level is just one more indent step, not a new
 * interaction pattern.
 * <para>
 * The category name is always a real link (navigates on its own); the expand/collapse chevron is a
 * *separate* button next to it, only rendered when `category.children` is non-empty — a "split
 * affordance", not a single overloaded control, so tapping the name never surprises someone who just
 * wanted to browse that category's own listing. `linkClick` is a plain `output()` that both this
 * component's own link and every recursively-rendered descendant's `linkClick` re-emit through, so
 * `MobileNav` can close the whole drawer from one `(linkClick)` binding on the top-level list no matter
 * how deep the tap happened.
 * </para>
 */
@Component({
  selector: 'app-category-accordion-item',
  imports: [RouterLink, TranslatePipe, NgIcon, CategoryAccordionItem],
  templateUrl: './category-accordion-item.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretDown, ...CATEGORY_ICONS })],
})
export class CategoryAccordionItem {
  readonly category = input.required<CategoryTreeNode>();
  readonly depth = input(0);
  readonly linkClick = output<void>();

  protected readonly translation = inject(TranslationService);
  protected readonly expanded = signal(false);

  protected readonly resolveIconName = resolveCategoryIconName;
  protected readonly resolveTone = resolveCategoryTone;

  protected categoryName(node: CategoryTreeNode): string {
    return this.translation.locale() === 'th' ? node.nameTh : node.nameEn;
  }

  protected toggleExpanded(): void {
    this.expanded.update((value) => !value);
  }

  protected emitLinkClick(): void {
    this.linkClick.emit();
  }
}
