import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../../core/i18n/translation.service';
import { Button } from '../../../../../../shared/button/button';
import { Checkbox } from '../../../../../../shared/checkbox/checkbox';
import { InputField } from '../../../../../../shared/input/input';
import { Modal } from '../../../../../../shared/modal/modal';
import { SelectField, type SelectOption } from '../../../../../../shared/select/select';
import { ToastService } from '../../../../../../shared/toast/toast.service';
import { FieldFeedback } from '../../../../ui/tutor-form.util';
import { TutorProblem } from '../../../../ui/tutor-problem/tutor-problem';
import { tutoringAdminErrorKey } from '../../../data/admin-errors';
import { AdminTutorApiService } from '../../../data/admin-tutor-api.service';
import type { AdminSubject } from '../../../data/admin-tutor.models';
import { SUBJECT_NAME_MAX, SUBJECT_SLUG_MAX, slugIssue, sortOrderIssue, subjectNameIssue } from '../subject-form.util';

type Field = 'slug' | 'nameTh' | 'nameEn' | 'sortOrder';

/**
 * Create or edit one subject (P13-26). A subject is a top-level group or sits under exactly one group (two levels at most, which
 * the server enforces - `subject_parent_invalid`). The slug is typed once, when creating: it is part of search URLs and the API
 * has no way to change it. Subjects are never deleted; switching one off (edit, "active" unticked) hides it from new offerings
 * and leaves existing ones alone.
 */
@Component({
  selector: 'app-subject-form-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Checkbox, InputField, Modal, SelectField, TutorProblem],
  templateUrl: './subject-form-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubjectFormDialog {
  private readonly api = inject(AdminTutorApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  /** `null` = create a new subject. */
  readonly subject = input<AdminSubject | null>(null);
  /** Every subject on the page; the top-level groups among them are the parent choices. */
  readonly subjects = input.required<readonly AdminSubject[]>();
  readonly saved = output<AdminSubject>();

  protected readonly slug = new FormControl('', { nonNullable: true });
  protected readonly nameTh = new FormControl('', { nonNullable: true });
  protected readonly nameEn = new FormControl('', { nonNullable: true });
  protected readonly parentId = new FormControl('', { nonNullable: true });
  protected readonly sortOrder = new FormControl('0', { nonNullable: true });
  protected readonly isActive = new FormControl(true, { nonNullable: true });
  private readonly values = {
    slug: toSignal(this.slug.valueChanges.pipe(startWith('')), { requireSync: true }),
    nameTh: toSignal(this.nameTh.valueChanges.pipe(startWith('')), { requireSync: true }),
    nameEn: toSignal(this.nameEn.valueChanges.pipe(startWith('')), { requireSync: true }),
    sortOrder: toSignal(this.sortOrder.valueChanges.pipe(startWith('0')), { requireSync: true }),
  };
  protected readonly feedback = new FieldFeedback<Field>();

  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly editing = computed(() => this.subject() !== null);
  protected readonly limits = { slug: SUBJECT_SLUG_MAX, name: SUBJECT_NAME_MAX };
  /** A group that has subjects under it cannot be placed under another group. */
  protected readonly hasChildren = computed(() => {
    const current = this.subject();
    return current !== null && this.subjects().some((candidate) => candidate.parentId === current.subjectId);
  });
  protected readonly parentOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.i18n.t('tutoring.admin.subjects.noParent') },
    ...this.subjects()
      .filter((candidate) => candidate.parentId === null && candidate.subjectId !== this.subject()?.subjectId)
      .map((group) => ({ value: group.subjectId, label: this.i18n.locale() === 'th' ? group.nameTh : group.nameEn })),
  ]);

  private readonly issues = computed(() => ({
    slug: this.editing() ? undefined : slugIssue(this.values.slug()),
    nameTh: subjectNameIssue(this.values.nameTh()),
    nameEn: subjectNameIssue(this.values.nameEn()),
    sortOrder: sortOrderIssue(this.values.sortOrder()),
  }));

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          const current = this.subject();
          this.slug.reset('');
          this.nameTh.reset(current?.nameTh ?? '');
          this.nameEn.reset(current?.nameEn ?? '');
          this.parentId.reset(current?.parentId ?? '');
          // A group that has subjects under it cannot be placed under another group (kept off the template's [disabled]: it clashes with the forms directive).
          if (this.hasChildren()) {
            this.parentId.disable();
          } else {
            this.parentId.enable();
          }
          this.sortOrder.reset(String(current?.sortOrder ?? 0));
          this.isActive.reset(current?.isActive ?? true);
          this.feedback.reset();
          this.problem.set(null);
        });
      }
    });
  }

  protected errorOf(field: Field): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n);
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.feedback.attempt();
    if (Object.values(this.issues()).some((found) => found !== undefined)) {
      return;
    }
    const current = this.subject();
    const base = {
      nameTh: this.nameTh.value.trim(),
      nameEn: this.nameEn.value.trim(),
      parentId: this.parentId.value === '' ? null : this.parentId.value,
      sortOrder: Number(this.sortOrder.value.trim()),
    };
    const request$ =
      current === null
        ? this.api.createSubject({ ...base, slug: this.slug.value.trim() })
        : this.api.updateSubject(current.subjectId, { ...base, isActive: this.isActive.value });
    this.busy.set(true);
    this.problem.set(null);
    request$.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.success(this.i18n.t(current === null ? 'tutoring.admin.subjects.created' : 'tutoring.admin.subjects.updated'));
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.problem.set(this.i18n.t(tutoringAdminErrorKey(error)));
      },
    });
  }
}
