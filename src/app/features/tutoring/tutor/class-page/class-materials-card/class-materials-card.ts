import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorDownloadSimple, phosphorFileText, phosphorLinkSimple, phosphorNotePencil, phosphorTrash, phosphorUploadSimple } from '@ng-icons/phosphor-icons/regular';
import { map, startWith } from 'rxjs';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { SelectField, type SelectOption } from '../../../../../shared/select/select';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { isHttpsUrl } from '../../../../live/data/live-instructor.util';
import type { Guid, MaterialDto } from '../../../data/tutoring-classes.models';
import { TutoringClassesApiService } from '../../../data/tutoring-classes-api.service';
import { tutoringErrorKey, tutoringReasonOf } from '../../../data/tutoring-errors';
import { extensionOf } from '../../../data/tutoring-kyc-api.service';
import { materialKindLabelKey } from '../../../data/tutoring-tutor-labels';
import { FieldFeedback, focusFirstInvalid } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import {
  MATERIAL_LIMITS,
  type MaterialChoice,
  type MaterialField,
  type MaterialFormValue,
  emptyMaterialForm,
  materialRequest,
  validateMaterial,
} from '../../tutor-class-form.util';

/** The file types a class material may be (P13-10 section 8.3). Only a convenience: the server checks the real content. */
const MATERIAL_FILE_EXTENSIONS: readonly string[] = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.md'];
const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * Teaching materials of one class (P13-25): links and homework first, shared with every learner booked on the class. External
 * links open in a new tab with `noopener noreferrer nofollow` and say they leave the platform; the server refuses a link that
 * would pull the lesson into another room. File upload is the server's feature flag (off by default): the control is offered,
 * and the first `materials_files_disabled` answer withdraws it for the rest of the visit, with an explanation, rather than the
 * client guessing the flag. A file is downloaded through a short-lived signed address that is used at once and never kept.
 */
@Component({
  selector: 'app-class-materials-card',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, BangkokDatePipe, Button, InputField, SelectField, Skeleton, TutorProblem, TutorTextarea],
  templateUrl: './class-materials-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorDownloadSimple, phosphorFileText, phosphorLinkSimple, phosphorNotePencil, phosphorTrash, phosphorUploadSimple })],
  host: { class: 'block' },
})
export class ClassMaterialsCard {
  private readonly api = inject(TutoringClassesApiService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  readonly sessionId = input.required<Guid>();
  /** The class is not cancelled, so materials can still be added or removed. */
  readonly editable = input(true);

  protected readonly limits = MATERIAL_LIMITS;
  protected readonly kindKey = materialKindLabelKey;
  protected readonly extensions = MATERIAL_FILE_EXTENSIONS.join(',');

  private readonly materialsResource = rxResource({ params: () => this.sessionId(), stream: ({ params }) => this.api.listMaterials(params) });
  protected readonly items = computed<readonly MaterialDto[]>(() => (this.materialsResource.hasValue() ? this.materialsResource.value() : []));
  protected readonly isLoading = computed(() => this.materialsResource.isLoading() && !this.materialsResource.hasValue());
  protected readonly hasError = computed(() => this.materialsResource.status() === 'error');

  protected readonly form = new FormGroup({
    kind: new FormControl<MaterialChoice>('Link', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true }),
    url: new FormControl('', { nonNullable: true }),
    bodyText: new FormControl('', { nonNullable: true }),
  });
  protected readonly raw = toSignal<MaterialFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateMaterial(this.raw()));
  protected readonly feedback = new FieldFeedback<MaterialField>();
  protected readonly isHomework = computed(() => this.raw().kind === 'Homework');
  protected readonly kindOptions = computed<readonly SelectOption[]>(() => [
    { value: 'Link', label: this.i18n.t('tutoring.enums.materialKind.Link') },
    { value: 'Homework', label: this.i18n.t('tutoring.enums.materialKind.Homework') },
  ]);
  protected readonly adding = signal(false);
  protected readonly uploading = signal(false);
  protected readonly busyId = signal<Guid | null>(null);
  protected readonly filesAvailable = signal(true);
  protected readonly problem = signal<string | null>(null);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  protected message(field: MaterialField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n);
  }

  /** Only an https address is ever bound to an `href`; anything else is shown as plain text. */
  protected safeUrl(item: MaterialDto): string | null {
    return item.url !== null && isHttpsUrl(item.url) ? item.url : null;
  }

  protected sizeText(bytes: number | null): string {
    return bytes === null ? '' : this.i18n.t('tutoring.tutor.classes.materials.fileSize', { size: Math.max(0.1, Math.round((bytes / BYTES_PER_MEGABYTE) * 10) / 10) });
  }

  protected reload(): void {
    this.materialsResource.reload();
  }

  protected add(): void {
    if (this.adding()) {
      return;
    }
    this.feedback.attempt();
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }
    this.adding.set(true);
    this.problem.set(null);
    this.api.addMaterial(this.sessionId(), materialRequest(this.raw())).subscribe({
      next: () => {
        this.adding.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.classes.materials.added'));
        this.form.reset(emptyMaterialForm(this.raw().kind));
        this.feedback.reset();
        this.materialsResource.reload();
      },
      error: (error: unknown) => {
        this.adding.set(false);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (file === null || this.uploading()) {
      return;
    }
    if (file.size === 0 || !MATERIAL_FILE_EXTENSIONS.includes(extensionOf(file.name))) {
      this.problem.set(this.i18n.t(file.size === 0 ? 'tutoring.kyc.upload.errorEmpty' : 'tutoring.tutor.classes.materials.fileTypeNotAllowed', { types: MATERIAL_FILE_EXTENSIONS.join(', ') }));
      return;
    }
    this.uploading.set(true);
    this.problem.set(null);
    const title = this.raw().title.trim();
    this.api.uploadMaterialFile(this.sessionId(), file, title.length > 0 ? title : null).subscribe({
      next: () => {
        this.uploading.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.classes.materials.added'));
        this.materialsResource.reload();
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        if (tutoringReasonOf(error) === 'tutoring.materials_files_disabled') {
          this.filesAvailable.set(false);
        }
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

  protected remove(item: MaterialDto): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(item.id);
    this.problem.set(null);
    this.api.removeMaterial(this.sessionId(), item.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(this.i18n.t('tutoring.tutor.classes.materials.removed'));
        this.materialsResource.reload();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

  /** Asks for a short-lived signed address and goes there at once; the file arrives as an attachment, so the page stays put. */
  protected download(item: MaterialDto): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(item.id);
    this.problem.set(null);
    this.api.getMaterialDownload(this.sessionId(), item.id).subscribe({
      next: (download) => {
        this.busyId.set(null);
        if (isHttpsUrl(download.downloadUrl)) {
          this.document.defaultView?.location.assign(download.downloadUrl);
        }
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
