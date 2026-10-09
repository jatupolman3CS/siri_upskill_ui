import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorInfo, phosphorUserCheck } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Modal } from '../../../shared/modal/modal';
import { Pagination } from '../../../shared/pagination/pagination';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { InstructorApplicationSummary } from './data/admin-instructor-api.models';
import { AdminInstructorApiService } from './data/admin-instructor-api.service';
import { InstructorApplicationCard } from './instructor-application-card/instructor-application-card';

type LoadState = 'loading' | 'error' | 'success';
type Decision = 'approve' | 'reject';

const PAGE_SIZE = 20;

/**
 * `/admin/instructors` — pending instructor applications. Without it an application sent from `/become-instructor`
 * can never be approved. Approving also grants the Instructor role; the backend does both in one commit, so this page
 * has nothing to coordinate. The server stays the authority on whether a decision is still possible: a 404/409 (someone
 * else already decided, or the row is gone) refreshes the list instead of leaving a stale card behind.
 */
@Component({
  selector: 'app-admin-instructors-page',
  imports: [TranslatePipe, NgIcon, Button, EmptyState, Modal, Pagination, Skeleton, InstructorApplicationCard],
  templateUrl: './admin-instructors-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorInfo, phosphorUserCheck })],
})
export class AdminInstructorsPage {
  private readonly api = inject(AdminInstructorApiService);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly applications = signal<readonly InstructorApplicationSummary[]>([]);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(0);
  protected readonly totalCount = signal(0);
  /** A decision (or the reload that follows it) is in flight: every action is disabled meanwhile. */
  protected readonly busy = signal(false);

  protected readonly confirmOpen = signal(false);
  protected readonly decision = signal<{ readonly kind: Decision; readonly application: InstructorApplicationSummary } | null>(null);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly isApprove = computed(() => this.decision()?.kind === 'approve');

  constructor() {
    setPageMeta({
      title: `${this.translation.t('admin.instructors.pageTitle')} · ${this.translation.t('common.appName')}`,
      description: this.translation.t('admin.instructors.pageDescription'),
      robots: 'noindex',
    });
    this.load(true);
  }

  protected load(showSkeleton: boolean): void {
    if (showSkeleton) {
      this.loadState.set('loading');
    }
    this.api
      .getPending(this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          // The last row of the last page was just decided: that page no longer exists, step back to the new last one.
          const lastPage = Math.max(1, result.totalPages);
          if (result.items.length === 0 && this.page() > lastPage) {
            this.page.set(lastPage);
            this.load(false);
            return;
          }
          this.applications.set(result.items);
          this.totalPages.set(result.totalPages);
          this.totalCount.set(result.totalCount);
          this.loadState.set('success');
          this.busy.set(false);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (showSkeleton || this.loadState() !== 'success') {
            this.loadState.set('error');
          } else {
            this.toast.error(this.translation.t(this.errorKey(error)));
          }
        },
      });
  }

  protected changePage(page: number): void {
    this.page.set(page);
    this.load(true);
  }

  protected ask(kind: Decision, application: InstructorApplicationSummary): void {
    this.decision.set({ kind, application });
    this.confirmError.set(null);
    this.confirmOpen.set(true);
  }

  protected confirm(): void {
    const current = this.decision();
    if (!current || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.confirmError.set(null);

    const name = current.application.displayName;
    const request$ = current.kind === 'approve' ? this.api.approve(current.application.id) : this.api.reject(current.application.id);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.confirmOpen.set(false);
        this.toast.success(this.translation.t(current.kind === 'approve' ? 'admin.instructors.toast.approved' : 'admin.instructors.toast.rejected', { name }));
        this.load(false);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const status = error instanceof ApiError ? error.status : 0;
        this.confirmError.set(this.translation.t(this.errorKey(error)));
        if (status === 404 || status === 409) {
          // Someone else decided it (or it is gone): show the truth behind the dialog too.
          this.load(false);
        }
      },
    });
  }

  private errorKey(error: unknown): string {
    if (!(error instanceof ApiError)) {
      return 'common.error';
    }
    switch (error.status) {
      case 401:
      case 403:
        return 'admin.instructors.errors.forbidden';
      case 404:
        return 'admin.instructors.errors.notFound';
      case 409:
        return 'admin.instructors.errors.alreadyDecided';
      default:
        return 'common.error';
    }
  }
}
