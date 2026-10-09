import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPlus, phosphorTreeStructure } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { buildMovedOrder, CategoryRow, findNode, flattenTree } from './category-admin.util';
import { CategoryErrorView, mapCategoryError } from './category-error.util';
import { CategoryDeleteDialog } from './category-delete-dialog/category-delete-dialog';
import { CategoryFormDialog, CategoryFormValue } from './category-form-dialog/category-form-dialog';
import { CategoryRowItem } from './category-row/category-row';
import { AdminCategoryApiService } from './data/admin-category-api.service';

type LoadState = 'loading' | 'error' | 'success';

/**
 * `/admin/categories` — the only place a category can be created. Without it the public category list stays empty and
 * the course builder (which requires a category) can never save a course.
 * <para>
 * Every write goes through `AdminCategoryApiService` and the server stays the authority: cycle prevention on a move,
 * slug uniqueness and "no delete while it has children" are all enforced there. The client mirrors the format rules
 * only to fail early, and shows the server's refusal when it still happens (stale tree, race).
 * </para>
 */
@Component({
  selector: 'app-admin-categories-page',
  imports: [TranslatePipe, NgIcon, Button, EmptyState, Skeleton, CategoryRowItem, CategoryFormDialog, CategoryDeleteDialog],
  templateUrl: './admin-categories-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorPlus, phosphorTreeStructure })],
})
export class AdminCategoriesPage {
  private readonly api = inject(AdminCategoryApiService);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly loadError = signal<CategoryErrorView | null>(null);
  protected readonly tree = signal<readonly CategoryTreeNode[]>([]);
  protected readonly rows = computed(() => flattenTree(this.tree()));
  /** A write is in flight (move/save/delete) — everything that writes is disabled meanwhile. */
  protected readonly busy = signal(false);
  protected readonly liveMessage = signal('');

  protected readonly formOpen = signal(false);
  protected readonly formMode = signal<'create' | 'edit'>('create');
  protected readonly formTarget = signal<CategoryRow | null>(null);
  protected readonly formParentId = signal<string | null>(null);
  protected readonly formError = signal<CategoryErrorView | null>(null);
  protected readonly formApiError = signal<ApiError | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<CategoryRow | null>(null);

  private readonly rowItems = viewChildren(CategoryRowItem);

  constructor() {
    setPageMeta({
      title: `${this.translation.t('admin.categories.pageTitle')} · ${this.translation.t('common.appName')}`,
      description: this.translation.t('admin.categories.pageDescription'),
      robots: 'noindex',
    });
    this.load(true);
  }

  protected nameOf(category: { readonly nameTh: string; readonly nameEn: string }): string {
    return this.translation.locale() === 'en' ? category.nameEn : category.nameTh;
  }

  /**
   * Reads the admin tree. `showSkeleton` is the first/retry load; a refresh after a write keeps the current tree on screen
   * (and `busy` set) until the new one arrives, then runs `afterLoad` once it has rendered.
   */
  protected load(showSkeleton: boolean, afterLoad?: () => void): void {
    if (showSkeleton) {
      this.loadState.set('loading');
    }
    this.api
      .getTree()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tree) => {
          this.tree.set(tree);
          this.loadState.set('success');
          this.busy.set(false);
          if (afterLoad) {
            afterNextRender(afterLoad, { injector: this.injector });
          }
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (this.loadState() !== 'success' || showSkeleton) {
            this.loadError.set(mapCategoryError('load', error));
            this.loadState.set('error');
          } else {
            this.toast.error(this.translation.t(mapCategoryError('load', error).key));
          }
        },
      });
  }

  // ---- create / edit ---------------------------------------------------------------------------

  protected openCreate(parentId: string | null): void {
    this.formMode.set('create');
    this.formTarget.set(null);
    this.formParentId.set(parentId);
    this.resetFormError();
    this.formOpen.set(true);
  }

  protected openEdit(row: CategoryRow): void {
    this.formMode.set('edit');
    this.formTarget.set(row);
    this.formParentId.set(row.parentId);
    this.resetFormError();
    this.formOpen.set(true);
  }

  protected save(value: CategoryFormValue): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.resetFormError();

    const target = this.formTarget();
    const request$ =
      this.formMode() === 'edit' && target
        ? this.api.update(target.node.id, value)
        : this.api.create({
            slug: value.slug,
            nameTh: value.nameTh,
            nameEn: value.nameEn,
            iconKey: value.iconKey,
            parentId: value.parentId,
          });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.formOpen.set(false);
        this.toast.success(
          this.translation.t(this.formMode() === 'edit' ? 'admin.categories.toast.updated' : 'admin.categories.toast.created', {
            name: this.nameOf(saved),
          }),
        );
        this.load(false);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.formError.set(mapCategoryError(this.formMode() === 'edit' ? 'update' : 'create', error, { slug: value.slug }));
        this.formApiError.set(error instanceof ApiError ? error : null);
      },
    });
  }

  // ---- delete ----------------------------------------------------------------------------------

  protected openDelete(row: CategoryRow): void {
    this.deleteTarget.set(row);
    this.deleteOpen.set(true);
  }

  /** The dialog already deleted and toasted; refresh the tree (kept disabled until it arrives). */
  protected onDeleted(): void {
    this.busy.set(true);
    this.load(false);
  }

  // ---- reorder ---------------------------------------------------------------------------------

  protected move(event: { readonly row: CategoryRow; readonly direction: 'up' | 'down' }): void {
    const { row, direction } = event;
    const siblings = row.parentId === null ? this.tree() : (findNode(this.tree(), row.parentId)?.children ?? []);
    const items = buildMovedOrder(siblings, row.index, direction);
    if (!items || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .reorder({ items })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const position = items.findIndex((item) => item.categoryId === row.node.id) + 1;
          this.liveMessage.set(
            this.translation.t('admin.categories.live.moved', { name: this.nameOf(row.node), position, total: items.length }),
          );
          this.load(false, () => this.focusMovedRow(row.node.id, direction));
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.toast.error(this.translation.t(mapCategoryError('reorder', error).key));
          this.load(false);
        },
      });
  }

  private focusMovedRow(categoryId: string, direction: 'up' | 'down'): void {
    this.rowItems()
      .find((item) => item.row().node.id === categoryId)
      ?.focusMove(direction);
  }

  private resetFormError(): void {
    this.formError.set(null);
    this.formApiError.set(null);
  }
}
