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
import { curriculumLabelKey, levelLabelKey } from '../../../data/tutoring-labels';
import { TUTOR_CURRICULA, TUTOR_LEVELS } from '../../../data/tutor-search-query.util';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import type { TutorCurriculum, TutorLevel } from '../../../data/tutoring-public.models';
import { TutoringTutorApiService } from '../../../data/tutoring-tutor-api.service';
import type { Guid, TutorOffering } from '../../../data/tutoring-tutor.models';
import { FieldFeedback, focusFirstInvalid, serverRejectedFields } from '../../../ui/tutor-form.util';
import {
  GROUP_SEATS,
  OFFERING_PROPERTY_TO_FIELD,
  type OfferingField,
  type OfferingFormValue,
  type SubjectChoice,
  TRIAL_MINUTES_CHOICES,
  emptyOfferingForm,
  offeringRequest,
  offeringToForm,
  validateOffering,
} from '../../tutor-offering-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/**
 * Create / edit form of one tutor offering (a subject x level x curriculum the tutor teaches, with its rates). The subject,
 * level and curriculum identify an offering, so they are locked when editing - change them by pausing this offering and
 * adding another. Every rule that depends on server configuration (the allowed rate range) is the server's answer to give.
 */
@Component({
  selector: 'app-tutor-offering-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Checkbox, InputField, SelectField, TutorProblem],
  templateUrl: './offering-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class OfferingForm {
  private readonly api = inject(TutoringTutorApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  /** `null` = create a new offering. */
  readonly offering = input<TutorOffering | null>(null);
  readonly subjectChoices = input.required<readonly SubjectChoice[]>();

  readonly saved = output<TutorOffering>();
  readonly cancelled = output<void>();
  /** The server says an identical (paused) offering exists; the owner scrolls to it so it can be re-opened instead. */
  readonly reopenRequested = output<Guid>();

  protected readonly form = new FormGroup({
    subjectId: new FormControl('', { nonNullable: true }),
    level: new FormControl<TutorLevel>('UpperSecondary', { nonNullable: true }),
    curriculum: new FormControl<TutorCurriculum>('Thai', { nonNullable: true }),
    hourlyRate: new FormControl('', { nonNullable: true }),
    groupEnabled: new FormControl(false, { nonNullable: true }),
    groupRate: new FormControl('', { nonNullable: true }),
    groupSeats: new FormControl('4', { nonNullable: true }),
    trialEnabled: new FormControl(false, { nonNullable: true }),
    trialMinutes: new FormControl<'15' | '30'>('30', { nonNullable: true }),
    trialPrice: new FormControl('0', { nonNullable: true }),
    isActive: new FormControl(true, { nonNullable: true }),
  });
  /** Raw value so a locked (disabled) identity control still counts - `valueChanges` alone would omit it. */
  protected readonly raw = toSignal<OfferingFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateOffering(this.raw()));
  protected readonly feedback = new FieldFeedback<OfferingField>();
  private readonly serverRejected = signal<ReadonlySet<OfferingField>>(new Set());

  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  private readonly duplicateOfferingId = signal<Guid | null>(null);
  protected readonly canReopenDuplicate = computed(() => this.duplicateOfferingId() !== null);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  protected readonly seats = GROUP_SEATS;
  protected readonly isEdit = computed(() => this.offering() !== null);
  protected readonly levelOptions = computed<readonly SelectOption[]>(() =>
    TUTOR_LEVELS.map((level) => ({ value: level, label: this.i18n.t(levelLabelKey(level)) })),
  );
  protected readonly curriculumOptions = computed<readonly SelectOption[]>(() =>
    TUTOR_CURRICULA.map((curriculum) => ({ value: curriculum, label: this.i18n.t(curriculumLabelKey(curriculum)) })),
  );
  protected readonly subjectOptions = computed<readonly SelectOption[]>(() =>
    this.subjectChoices().map((choice) => ({ value: choice.subjectId, label: choice.label, disabled: choice.disabled })),
  );
  protected readonly trialMinuteOptions = computed<readonly SelectOption[]>(() =>
    TRIAL_MINUTES_CHOICES.map((minutes) => ({ value: minutes, label: this.i18n.t('tutoring.tutor.offerings.minutes', { count: minutes }) })),
  );
  protected readonly groupEnabled = computed(() => this.raw().groupEnabled);
  protected readonly trialEnabled = computed(() => this.raw().trialEnabled);

  constructor() {
    // (Re)load the form whenever the offering being edited changes; `null` = a blank form for a new one.
    effect(() => {
      const existing = this.offering();
      untracked(() => this.initialise(existing));
    });
  }

  private initialise(existing: TutorOffering | null): void {
    const identity = [this.form.controls.subjectId, this.form.controls.level, this.form.controls.curriculum];
    for (const control of identity) {
      control.enable({ emitEvent: false });
    }
    this.form.reset(existing ? offeringToForm(existing) : emptyOfferingForm());
    this.feedback.reset();
    this.problem.set(null);
    if (existing) {
      // Subject / level / curriculum are the identity of an offering.
      for (const control of identity) {
        control.disable({ emitEvent: false });
      }
    }
  }

  protected message(field: OfferingField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected reopenDuplicate(): void {
    const id = this.duplicateOfferingId();
    if (id !== null) {
      this.reopenRequested.emit(id);
    }
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.feedback.attempt();
    this.serverRejected.set(new Set());
    this.duplicateOfferingId.set(null);
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }

    const body = offeringRequest(this.raw());
    const existing = this.offering();
    this.saving.set(true);
    this.problem.set(null);
    const request = existing ? this.api.updateOffering(existing.offeringId, body) : this.api.createOffering(body);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.success(this.i18n.t(existing ? 'tutoring.tutor.offerings.saved' : 'tutoring.tutor.offerings.created'));
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverRejected.set(serverRejectedFields(error, OFFERING_PROPERTY_TO_FIELD));
        if (tutoringReasonOf(error) === 'tutoring.offering_duplicate') {
          this.duplicateOfferingId.set(tutoringProblemOf(error)?.offeringId ?? null);
        }
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
