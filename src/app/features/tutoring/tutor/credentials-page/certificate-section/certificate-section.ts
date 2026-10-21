import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCertificate, phosphorPencilSimple, phosphorPlus, phosphorTrash } from '@ng-icons/phosphor-icons/regular';
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
import type { TutorCertificate } from '../../../data/tutoring-tutor.models';
import { FieldFeedback, bangkokYear, focusFirstInvalid, serverRejectedFields } from '../../../ui/tutor-form.util';
import {
  CERTIFICATE_PROPERTY_TO_FIELD,
  type CertificateField,
  type CertificateFormValue,
  certificateRequest,
  certificateToForm,
  emptyCertificateForm,
  validateCertificate,
} from '../../tutor-credential-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/**
 * Certificates and licences the tutor chooses to show on the public profile. These are display entries only - the documents
 * used for identity verification are a separate, private flow (the verification page) and are never shown here.
 */
@Component({
  selector: 'app-tutor-certificate-section',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, EmptyState, InputField, Modal, Skeleton, TutorProblem],
  templateUrl: './certificate-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCertificate, phosphorPencilSimple, phosphorPlus, phosphorTrash })],
  host: { class: 'block' },
})
export class CertificateSection {
  private readonly api = inject(TutoringTutorApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  private readonly resource = rxResource({ stream: () => this.api.listCertificates() });
  protected readonly items = computed<readonly TutorCertificate[]>(() => (this.resource.hasValue() ? this.resource.value().items : []));
  protected readonly isLoading = computed(() => this.resource.isLoading() && !this.resource.hasValue());
  protected readonly hasError = computed(() => this.resource.status() === 'error');

  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    issuer: new FormControl('', { nonNullable: true }),
    year: new FormControl('', { nonNullable: true }),
  });
  private readonly raw = toSignal<CertificateFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateCertificate(this.raw(), bangkokYear(new Date())));
  protected readonly feedback = new FieldFeedback<CertificateField>();
  private readonly serverRejected = signal<ReadonlySet<CertificateField>>(new Set());

  /** `null` = closed; `item: null` = a new row. */
  protected readonly editor = signal<{ readonly item: TutorCertificate | null } | null>(null);
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly toDelete = signal<TutorCertificate | null>(null);
  protected readonly deleting = signal(false);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  protected message(field: CertificateField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected reload(): void {
    this.resource.reload();
  }

  protected open(item: TutorCertificate | null): void {
    this.form.reset(item ? certificateToForm(item) : emptyCertificateForm());
    this.feedback.reset();
    this.serverRejected.set(new Set());
    this.problem.set(null);
    this.editor.set({ item });
    afterNextRender(() => document.getElementById('tutor-certificate-editor')?.focus(), { injector: this.injector });
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

    const body = certificateRequest(this.raw(), state.item?.sortOrder ?? this.items().length);
    this.saving.set(true);
    this.problem.set(null);
    const request = state.item ? this.api.updateCertificate(state.item.certificateId, body) : this.api.createCertificate(body);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.t(state.item ? 'tutoring.tutor.certificates.saved' : 'tutoring.tutor.certificates.created'));
        this.resource.reload();
        this.close();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverRejected.set(serverRejectedFields(error, CERTIFICATE_PROPERTY_TO_FIELD));
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
    this.api.deleteCertificate(item.certificateId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.toDelete.set(null);
        this.toast.success(this.i18n.t('tutoring.tutor.certificates.deleted'));
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
