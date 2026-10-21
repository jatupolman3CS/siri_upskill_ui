import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { Checkbox } from '../../../../shared/checkbox/checkbox';
import { InputField } from '../../../../shared/input/input';
import { SelectField, type SelectOption } from '../../../../shared/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../data/tutoring-errors';
import { gradeLabelKey } from '../../data/tutoring-labels';
import { TutoringLearnerApiService } from '../../data/tutoring-learner-api.service';
import type { LearnerGrade, LearnerProfile } from '../../data/tutoring-learner.models';
import { FieldFeedback, focusFirstInvalid, serverRejectedFields } from '../../ui/tutor-form.util';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import {
  GUARDIAN_CONSENT_VERSION,
  LEARNER_GRADES,
  LEARNER_PROPERTY_TO_FIELD,
  type LearnerFormValue,
  type LearnerProfileField,
  NICKNAME_MAX_LENGTH,
  emptyLearnerForm,
  isSchoolGrade,
  learnerProfileRequest,
  learnerToForm,
  validateLearnerProfile,
} from '../learner-profile-form.util';

/**
 * Create / edit form of one learner profile (P13-22): a nickname and a school grade - never a real name, birth date, school
 * or contact. For a minor the guardian's consent is an explicit, never pre-ticked checkbox next to the consent text, and it
 * is asked for on every save because the server requires `guardianConsent: true` each time.
 * <para>
 * Shared by `/account/learner-profiles` and the booking page (create a learner without leaving the booking). The server
 * stays the authority: its validation answer, including `tutoring.learner_profile_limit`, is shown as given. If the consent
 * text version moved on, the person is asked to reload and read the current text - this form never re-sends a version
 * whose text it did not show.
 * </para>
 */
@Component({
  selector: 'app-learner-profile-form',
  imports: [ReactiveFormsModule, TranslatePipe, BangkokDatePipe, Button, Checkbox, InputField, SelectField, TutorProblem],
  templateUrl: './learner-profile-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class LearnerProfileForm {
  private readonly api = inject(TutoringLearnerApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  protected readonly i18n = inject(TranslationService);

  /** `null` = create a new profile. */
  readonly profile = input<LearnerProfile | null>(null);
  /** Hide the cancel button when the form is the only thing to do (an account with no learner yet). */
  readonly cancellable = input(true);

  readonly saved = output<LearnerProfile>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    nickname: new FormControl('', { nonNullable: true }),
    gradeLevel: new FormControl<LearnerGrade>('Secondary4', { nonNullable: true }),
    isMinor: new FormControl(true, { nonNullable: true }),
    guardianConsent: new FormControl(false, { nonNullable: true }),
  });
  /** Raw value so a locked (disabled) `isMinor` still counts - `valueChanges` alone would omit it. */
  protected readonly raw = toSignal<LearnerFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateLearnerProfile(this.raw()));
  protected readonly feedback = new FieldFeedback<LearnerProfileField>();
  private readonly serverRejected = signal<ReadonlySet<LearnerProfileField>>(new Set());

  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly consentOutdated = signal(false);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');
  private readonly consentError = viewChild<ElementRef<HTMLElement>>('consentError');

  protected readonly isEdit = computed(() => this.profile() !== null);
  protected readonly nicknameMax = NICKNAME_MAX_LENGTH;
  protected readonly consentVersion = GUARDIAN_CONSENT_VERSION;
  protected readonly gradeLocksMinor = computed(() => isSchoolGrade(this.raw().gradeLevel));
  protected readonly needsConsent = computed(() => this.raw().isMinor || this.gradeLocksMinor());
  protected readonly gradeOptions = computed<readonly SelectOption[]>(() =>
    LEARNER_GRADES.map((grade) => ({ value: grade, label: this.i18n.t(gradeLabelKey(grade)) })),
  );
  protected readonly consentSavedAt = computed(() => this.profile()?.guardianConsentAtUtc ?? null);

  constructor() {
    // A school grade is always a minor: show the box ticked and locked rather than letting the person untick a fact.
    this.form.controls.gradeLevel.valueChanges.pipe(takeUntilDestroyed()).subscribe((grade) => this.syncMinorLock(grade));

    // (Re)load the form whenever the profile being edited changes; `null` = a blank form for a new one.
    effect(() => {
      const existing = this.profile();
      untracked(() => this.initialise(existing));
    });
  }

  private initialise(existing: LearnerProfile | null): void {
    this.form.controls.isMinor.enable({ emitEvent: false });
    this.form.reset(existing ? learnerToForm(existing) : emptyLearnerForm());
    this.syncMinorLock(this.form.controls.gradeLevel.value);
    this.feedback.reset();
    this.serverRejected.set(new Set());
    this.problem.set(null);
    this.consentOutdated.set(false);
  }

  private syncMinorLock(grade: LearnerGrade): void {
    const isMinor = this.form.controls.isMinor;
    if (isSchoolGrade(grade)) {
      isMinor.setValue(true);
      isMinor.disable({ emitEvent: false });
    } else if (isMinor.disabled) {
      isMinor.enable({ emitEvent: false });
    }
  }

  protected message(field: LearnerProfileField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected reloadPage(): void {
    this.document.location.reload();
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.feedback.attempt();
    this.serverRejected.set(new Set());
    this.consentOutdated.set(false);
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement, this.consentError()?.nativeElement), { injector: this.injector });
      return;
    }

    const body = learnerProfileRequest(this.raw());
    const existing = this.profile();
    this.saving.set(true);
    this.problem.set(null);
    const request = existing ? this.api.updateLearnerProfile(existing.learnerProfileId, body) : this.api.createLearnerProfile(body);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.success(this.i18n.t(existing ? 'tutoring.learner.form.updated' : 'tutoring.learner.form.created'));
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverRejected.set(serverRejectedFields(error, LEARNER_PROPERTY_TO_FIELD));
        const current = tutoringProblemOf(error)?.currentVersion;
        this.consentOutdated.set(tutoringReasonOf(error) === 'tutoring.guardian_consent_required' && current !== undefined && current !== GUARDIAN_CONSENT_VERSION);
        this.problem.set(this.i18n.t(this.consentOutdated() ? 'tutoring.learner.form.consentOutdated' : tutoringErrorKey(error)));
      },
    });
  }
}
