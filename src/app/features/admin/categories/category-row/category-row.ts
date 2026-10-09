import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowDown,
  phosphorArrowUp,
  phosphorCheckCircle,
  phosphorEyeSlash,
  phosphorPencilSimple,
  phosphorPlus,
  phosphorTrash,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { CATEGORY_ICONS, resolveCategoryIconName } from '../../../catalog/category-icon';
import { CategoryRow } from '../category-admin.util';

/**
 * One row of the admin category tree. Presentational: every action is an output the page handles. The tree is rendered
 * flat (depth only drives the indent and a screen-reader level hint) so the page needs no recursive component.
 * Reordering is two plain buttons, never drag-only, so it works with a keyboard and a screen reader.
 */
@Component({
  selector: 'app-category-row',
  imports: [NgIcon, TranslatePipe],
  templateUrl: './category-row.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      ...CATEGORY_ICONS,
      phosphorArrowDown,
      phosphorArrowUp,
      phosphorCheckCircle,
      phosphorEyeSlash,
      phosphorPencilSimple,
      phosphorPlus,
      phosphorTrash,
    }),
  ],
  host: { class: 'block', '[style.margin-inline-start.rem]': 'row().depth * 1.5' },
})
export class CategoryRowItem {
  private readonly translation = inject(TranslationService);

  readonly row = input.required<CategoryRow>();
  /** A request is in flight: every action is disabled so a second click cannot race the first. */
  readonly busy = input(false);

  readonly edit = output<CategoryRow>();
  readonly addChild = output<CategoryRow>();
  readonly remove = output<CategoryRow>();
  readonly move = output<{ readonly row: CategoryRow; readonly direction: 'up' | 'down' }>();

  private readonly moveUpButton = viewChild<ElementRef<HTMLButtonElement>>('moveUp');
  private readonly moveDownButton = viewChild<ElementRef<HTMLButtonElement>>('moveDown');

  protected readonly iconName = computed(() => resolveCategoryIconName(this.row().node.iconKey));
  protected readonly primaryName = computed(() => {
    const { nameTh, nameEn } = this.row().node;
    return this.translation.locale() === 'en' ? nameEn : nameTh;
  });
  protected readonly secondaryName = computed(() => {
    const { nameTh, nameEn } = this.row().node;
    return this.translation.locale() === 'en' ? nameTh : nameEn;
  });
  protected readonly canMoveUp = computed(() => this.row().index > 0);
  protected readonly canMoveDown = computed(() => this.row().index < this.row().siblingCount - 1);

  /** Puts focus back on the move button just used (or its opposite once that one reached the end of the list). */
  focusMove(direction: 'up' | 'down'): void {
    const preferred = direction === 'up' ? this.moveUpButton() : this.moveDownButton();
    const fallback = direction === 'up' ? this.moveDownButton() : this.moveUpButton();
    const target = preferred && !preferred.nativeElement.disabled ? preferred : fallback;
    target?.nativeElement.focus();
  }
}
