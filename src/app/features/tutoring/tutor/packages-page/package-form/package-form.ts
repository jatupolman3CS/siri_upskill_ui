import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Checkbox } from '../../../../../shared/checkbox/checkbox';
import { InputField } from '../../../../../shared/input/input';
import { SelectField, type SelectOption } from '../../../../../shared/select/select';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import type { Guid, TutorPackage } from '../../../data/tutoring-packages.models';
import { TutoringPackagesApiService } from '../../../data/tutoring-packages-api.service';
import { FieldFeedback, focusFirstInvalid, serverRejectedFields } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import {
  PACKAGE_LIMITS,
  PACKAGE_PROPERTY_TO_FIELD,
  type PackageField,
  type PackageFormValue,
  emptyPackageForm,
  packageRequest,
  packageToForm,
  validatePackage,
} from '../../tutor-package-form.util';

/** One option of the subject select, already localised. */
export interface OfferingChoice {
  readonly offeringId: Guid;
  readonly label: string;
}

/**
 * Create / edit form of one tutor package: N one-on-one lessons of M minutes at a discount. The subject, the number of lessons and
 * their length identify a package (learners buy that exact bundle), so they are locked when editing - change them by creating
 * another package. Discount, validity and the active switch can change at any time. There is no price field and no price preview
 * on purpose: the server computes the price from the tutor's current hourly rate when the package is saved and answers it.
 */
@Component({
  selector: 'app-tutor-package-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Checkbox, InputField, SelectField, TutorProblem],
  templateUrl: './package-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PackageForm {
  private readonly api = inject(TutoringPackagesApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  /** `null` = create a new package. */
  readonly tutorPackage = input<TutorPackage | null>(null);
  readonly offeringChoices = input.required<readonly OfferingChoice[]>();
  /** The class lengths (minutes) the server accepts - the tutor profile's `allowedDurationMinutes`. Required: the form never assumes a list. */
  readonly allowedDurationMinutes = input.required<readonly number[]>();
  readonly saved = output<TutorPackage>();
  readonly cancelled = output<void>();

  protected readonly limits = PACKAGE_LIMITS;
  protected readonly form = new FormGroup({
    offeringId: new FormControl('', { nonNullable: true }),
    sessionCount: new FormControl('', { nonNullable: true }),
    durationMinutes: new FormControl('', { nonNullable: true }),
    discountPercent: new FormControl('', { nonNullable: true }),
    validDays: new FormControl('', { nonNullable: true }),
    isActive: new FormControl(true, { nonNullable: true }),
  });
  protected readonly raw = toSignal<PackageFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validatePackage(this.raw(), this.allowedDurationMinutes()));
  protected readonly feedback = new FieldFeedback<PackageField>();
  private readonly serverRejected = signal<ReadonlySet<PackageField>>(new Set());
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  protected readonly isEdit = computed(() => this.tutorPackage() !== null);
  protected readonly offeringOptions = computed<readonly SelectOption[]>(() => this.offeringChoices().map((choice) => ({ value: choice.offeringId, label: choice.label })));
  protected readonly durationOptions = computed<readonly SelectOption[]>(() =>
    this.allowedDurationMinutes().map((minutes) => ({ value: String(minutes), label: this.i18n.t('tutoring.tutor.packages.minutes', { count: minutes }) })),
  );

  constructor() {
    // (Re)load the form whenever the package being edited changes; `null` = a blank form for a new one.
    effect(() => {
      const existing = this.tutorPackage();
      const first = this.offeringChoices().at(0)?.offeringId ?? '';
      // The length list only picks the starting length of a NEW package; a later change of the list must not wipe what is being typed.
      untracked(() => this.initialise(existing, first, this.allowedDurationMinutes()));
    });
  }

  private initialise(existing: TutorPackage | null, firstOffering: Guid, allowedDurations: readonly number[]): void {
    const identity = [this.form.controls.offeringId, this.form.controls.sessionCount, this.form.controls.durationMinutes];
    for (const control of identity) {
      control.enable({ emitEvent: false });
    }
    this.form.reset(existing ? packageToForm(existing) : emptyPackageForm(firstOffering, allowedDurations));
    this.feedback.reset();
    this.serverRejected.set(new Set());
    this.problem.set(null);
    if (existing) {
      // Subject, lesson count and length identify a package; they cannot change after it exists.
      for (const control of identity) {
        control.disable({ emitEvent: false });
      }
    }
  }

  protected message(field: PackageField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.feedback.attempt();
    this.serverRejected.set(new Set());
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }
    const body = packageRequest(this.raw());
    const existing = this.tutorPackage();
    this.saving.set(true);
    this.problem.set(null);
    const request = existing ? this.api.updatePackage(existing.packageId, body) : this.api.createPackage(body);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.success(this.i18n.t(existing ? 'tutoring.tutor.packages.saved' : 'tutoring.tutor.packages.created'));
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverRejected.set(serverRejectedFields(error, PACKAGE_PROPERTY_TO_FIELD));
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
        afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      },
    });
  }
}
