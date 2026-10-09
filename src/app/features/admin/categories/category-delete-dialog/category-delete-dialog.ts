import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { Modal } from '../../../../shared/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { CategoryRow } from '../category-admin.util';
import { CategoryErrorView, mapCategoryError } from '../category-error.util';
import { AdminCategoryApiService } from '../data/admin-category-api.service';

/**
 * Confirm-then-delete dialog. Owns the DELETE call so a refusal can stay next to the button that caused it: the server
 * answers 409 while the category still has children (or is in use), and that reason is shown inside the dialog — it
 * never closes on failure. The page only hears about success through `deleted`, then refreshes its tree.
 */
@Component({
  selector: 'app-category-delete-dialog',
  imports: [TranslatePipe, Modal, Button],
  templateUrl: './category-delete-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryDeleteDialog {
  private readonly api = inject(AdminCategoryApiService);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = model(false);
  readonly target = input<CategoryRow | null>(null);
  readonly deleted = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<CategoryErrorView | null>(null);
  protected readonly name = computed(() => {
    const node = this.target()?.node;
    if (!node) {
      return '';
    }
    return this.translation.locale() === 'en' ? node.nameEn : node.nameTh;
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.error.set(null));
      }
    });
  }

  protected confirm(): void {
    const target = this.target();
    if (!target || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .remove(target.node.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.open.set(false);
          this.toast.success(this.translation.t('admin.categories.toast.deleted', { name: this.name() }));
          this.deleted.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(mapCategoryError('delete', error));
        },
      });
  }
}
