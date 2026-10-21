import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { trackStudioMeta } from '../../../../live/instructor/studio-meta';
import { tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminTutorApiService } from '../../data/admin-tutor-api.service';
import { activeStateView } from '../../data/admin-labels';
import type { AdminSubject } from '../../data/admin-tutor.models';
import { AdminChip } from '../../ui/admin-chip';
import { AdminConfirmDialog } from '../../ui/admin-confirm-dialog';
import { AdminTutoringNav } from '../../ui/admin-tutoring-nav';
import { SubjectFormDialog } from './subject-form-dialog/subject-form-dialog';

const PAGE_SIZE = 100;

/**
 * `/admin/tutoring/subjects` - the subject catalogue tutors pick from (P13-26): top-level groups, each followed by its subjects,
 * with inactive ones included. Create, rename/move/re-sort and switch on/off; there is no delete and no slug change (the API
 * has neither). Switching a subject off hides it from new offerings and leaves existing ones alone; the server keeps the
 * public lists in step.
 */
@Component({
  selector: 'app-admin-subjects-page',
  imports: [TranslatePipe, Button, EmptyState, Pagination, Skeleton, AdminChip, AdminConfirmDialog, AdminTutoringNav, SubjectFormDialog],
  templateUrl: './admin-subjects-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSubjectsPage {
  private readonly api = inject(AdminTutorApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  protected readonly page = signal(1);
  private readonly subjectsResource = rxResource({
    params: () => ({ page: this.page() }),
    stream: ({ params }) => this.api.listSubjects(true, params.page, PAGE_SIZE),
  });
  protected readonly subjects = computed<readonly AdminSubject[]>(() => (this.subjectsResource.hasValue() ? this.subjectsResource.value().items : []));
  protected readonly totalPages = computed(() => (this.subjectsResource.hasValue() ? this.subjectsResource.value().totalPages : 1));
  protected readonly isLoading = computed(() => this.subjectsResource.isLoading() && !this.subjectsResource.hasValue());
  protected readonly hasError = computed(() => this.subjectsResource.status() === 'error');
  protected readonly errorKey = computed(() => (this.hasError() ? tutoringAdminErrorKey(this.subjectsResource.error()) : ''));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<AdminSubject | null>(null);
  protected readonly toggleOpen = signal(false);
  protected readonly toggling = signal<AdminSubject | null>(null);
  protected readonly toggleBusy = signal(false);
  protected readonly toggleProblem = signal<string | null>(null);
  protected readonly stateView = activeStateView;

  constructor() {
    trackStudioMeta('tutoring.admin.subjects.pageTitle', 'tutoring.admin.subjects.pageDescription', () => '/admin/tutoring/subjects');
  }

  protected nameOf(subject: AdminSubject): string {
    return this.i18n.locale() === 'th' ? subject.nameTh : subject.nameEn;
  }

  protected create(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected edit(subject: AdminSubject): void {
    this.editing.set(subject);
    this.formOpen.set(true);
  }

  protected askToggle(subject: AdminSubject): void {
    this.toggling.set(subject);
    this.toggleProblem.set(null);
    this.toggleOpen.set(true);
  }

  /** Switching on/off is an update that keeps everything else as it is. */
  protected confirmToggle(): void {
    const subject = this.toggling();
    if (subject === null || this.toggleBusy()) {
      return;
    }
    this.toggleBusy.set(true);
    this.toggleProblem.set(null);
    this.api
      .updateSubject(subject.subjectId, { nameTh: subject.nameTh, nameEn: subject.nameEn, parentId: subject.parentId, sortOrder: subject.sortOrder, isActive: !subject.isActive })
      .subscribe({
        next: () => {
          this.toggleBusy.set(false);
          this.toggleOpen.set(false);
          this.toast.success(this.i18n.t('tutoring.admin.subjects.updated'));
          this.reload();
        },
        error: (error: unknown) => {
          this.toggleBusy.set(false);
          this.toggleProblem.set(this.i18n.t(tutoringAdminErrorKey(error)));
        },
      });
  }

  protected reload(): void {
    this.subjectsResource.reload();
  }
}
