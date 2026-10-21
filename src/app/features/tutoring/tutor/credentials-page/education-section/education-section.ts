import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorGraduationCap, phosphorPencilSimple, phosphorPlus, phosphorTrash } from '@ng-icons/phosphor-icons/regular';
import { map, startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../../shared/input/input';
import { Modal } from '../../../../../shared/modal/modal';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutoringTutorApiService } from '../../../data/tutoring-tutor-api.service';
import type { TutorEducation } from '../../../data/tutoring-tutor.models';
import { FieldFeedback, bangkokYear, focusFirstInvalid, serverRejectedFields } from '../../../ui/tutor-form.util';
import {
  EDUCATION_PROPERTY_TO_FIELD,
  type EducationField,
  type EducationFormValue,
  educationRequest,
  educationToForm,
  emptyEducationForm,
  validateEducation,
} from '../../tutor-credential-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/**
 * Education history of the tutor profile: shown publicly once the tutor is verified and listed. Rows can be edited and
 * removed (unlike offerings, nothing else refers to them). A new row goes to the end of the list.
 */
@Component({
  selector: 'app-tutor-education-section',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, EmptyState, InputField, Modal, Skeleton, TutorProblem],
  templateUrl: './education-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorGraduationCap, phosphorPencilSimple, phosphorPlus, phosphorTrash })],
  host: { class: 'block' },
})
export class EducationSection {
  private readonly api = inject(TutoringTutorApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  private readonly resource = rxResource({ stream: () => this.api.listEducations() });
  protected readonly items = computed<readonly TutorEducation[]>(() => (this.resource.hasValue() ? this.resource.value().items : []));
  protected readonly isLoading = computed(() => this.resource.isLoading() && !this.resource.hasValue());
  protected readonly hasError = computed(() => this.resource.status() === 'error');

  protected readonly form = new FormGroup({
    institution: new FormControl('', { nonNullable: true }),
    degree: new FormControl('', { nonNullable: true }),
    field: new FormControl('', { nonNullable: true }),
    yearFrom: new FormControl('', { nonNullable: true }),
    yearTo: new FormControl('', { nonNullable: true }),
  });
  private readonly raw = toSignal<EducationFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateEducation(this.raw(), bangkokYear(new Date())));
  protected readonly feedback = new FieldFeedback<EducationField>();
  private readonly serverRejected = signal<ReadonlySet<EducationField>>(new Set());

  /** `null` = closed; `item: null` = a new row. */
  protected readonly editor = signal<{ readonly item: TutorEducation | null } | null>(null);
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly toDelete = signal<TutorEducation | null>(null);
  protected readonly deleting = signal(false);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  protected message(field: EducationField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected reload(): void {
    this.resource.reload();
  }

  protected open(item: TutorEducation | null): void {
    this.form.reset(item ? educationToForm(item) : emptyEducationForm());
    this.feedback.reset();
    this.serverRejected.set(new Set());
    this.problem.set(null);
    this.editor.set({ item });
    afterNextRender(() => document.getElementById('tutor-education-editor')?.focus(), { injector: this.injector });
  }

  protected close(): void {
    this.editor.set(null);
  }

  protected save(): void {
    const state = this.editor();
    if (state === null || this.saving()) {
      return;
    }
    this.feedback.attempt();
    this.serverRejected.set(new Set());
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }

    const body = educationRequest(this.raw(), state.item?.sortOrder ?? this.items().length);
    this.saving.set(true);
    this.problem.set(null);
    const request = state.item ? this.api.updateEducation(state.item.educationId, body) : this.api.createEducation(body);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.t(state.item ? 'tutoring.tutor.education.saved' : 'tutoring.tutor.education.created'));
        this.resource.reload();
        this.close();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverRejected.set(serverRejectedFields(error, EDUCATION_PROPERTY_TO_FIELD));
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

  protected confirmDelete(): void {
    const item = this.toDelete();
    if (item === null || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteEducation(item.educationId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.toDelete.set(null);
        this.toast.success(this.i18n.t('tutoring.tutor.education.deleted'));
        this.resource.reload();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.toDelete.set(null);
        this.toast.error(this.i18n.t(tutoringErrorKey(error)));
        this.resource.reload();
      },
    });
  }
}
