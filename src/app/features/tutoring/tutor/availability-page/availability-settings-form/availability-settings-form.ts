import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { SelectField, type SelectOption } from '../../../../../shared/select/select';
import { ToastService } from '../../../../../shared/toast/toast.service';
import type { AvailabilitySettings } from '../../../data/tutoring-availability.models';
import { TutoringAvailabilityApiService } from '../../../data/tutoring-availability-api.service';
import { tutoringErrorKey, tutoringReasonOf } from '../../../data/tutoring-errors';
import { FieldFeedback, focusFirstInvalid, serverRejectedFields } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import {
  BUFFER_CHOICES,
  MAX_ADVANCE_RANGE,
  MIN_NOTICE_RANGE,
  SETTINGS_PROPERTY_TO_FIELD,
  type SettingsField,
  type SettingsFormValue,
  settingText,
  settingsRequest,
  validateSettings,
} from '../../tutor-availability.util';

/**
 * Booking rules of the tutor (P13-25): how much notice a learner must give, the rest after each class and how far ahead the
 * calendar opens. They apply to NEW bookings only - the server says so too, and so does the helper text. The row version of the
 * tutor profile rides along; a stale one (the profile was edited elsewhere) is a conflict the page resolves by reloading.
 * Range errors are shown per field, taken from the server's `errors` answer as well as from the same bounds checked up front.
 */
@Component({
  selector: 'app-availability-settings-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, InputField, SelectField, TutorProblem],
  templateUrl: './availability-settings-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AvailabilitySettingsForm {
  private readonly api = inject(TutoringAvailabilityApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  readonly settings = input.required<AvailabilitySettings>();
  readonly saved = output<AvailabilitySettings>();
  /** The profile changed under the tutor (stale row version): the owner should reload everything. */
  readonly conflict = output<void>();

  protected readonly noticeRange = MIN_NOTICE_RANGE;
  protected readonly advanceRange = MAX_ADVANCE_RANGE;

  protected readonly form = new FormGroup({
    minNoticeHours: new FormControl('', { nonNullable: true }),
    bufferMinutes: new FormControl('', { nonNullable: true }),
    maxAdvanceDays: new FormControl('', { nonNullable: true }),
  });
  protected readonly raw = toSignal<SettingsFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateSettings(this.raw()));
  protected readonly feedback = new FieldFeedback<SettingsField>();
  private readonly serverRejected = signal<ReadonlySet<SettingsField>>(new Set());
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  protected readonly bufferOptions = computed<readonly SelectOption[]>(() =>
    BUFFER_CHOICES.map((minutes) => ({ value: String(minutes), label: this.i18n.t('tutoring.tutor.availability.settings.bufferOption', { count: minutes }) })),
  );
  protected readonly dirty = computed(() => {
    const stored = this.settings();
    const value = this.raw();
    return (
      value.minNoticeHours !== settingText(stored.minNoticeHours) ||
      value.bufferMinutes !== settingText(stored.bufferMinutes) ||
      value.maxAdvanceDays !== settingText(stored.maxAdvanceDays)
    );
  });

  constructor() {
    effect(() => {
      const stored = this.settings();
      untracked(() => {
        this.form.reset({
          minNoticeHours: settingText(stored.minNoticeHours),
          bufferMinutes: settingText(stored.bufferMinutes),
          maxAdvanceDays: settingText(stored.maxAdvanceDays),
        });
        this.feedback.reset();
        this.serverRejected.set(new Set());
      });
    });
  }

  protected message(field: SettingsField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected discard(): void {
    const stored = this.settings();
    this.form.reset({
      minNoticeHours: settingText(stored.minNoticeHours),
      bufferMinutes: settingText(stored.bufferMinutes),
      maxAdvanceDays: settingText(stored.maxAdvanceDays),
    });
    this.feedback.reset();
    this.serverRejected.set(new Set());
    this.problem.set(null);
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

    this.saving.set(true);
    this.problem.set(null);
    this.api.saveSettings(settingsRequest(this.raw(), this.settings().rowVersion)).subscribe({
      next: (next) => {
        this.saving.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.availability.settings.saved'));
        this.saved.emit(next);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverRejected.set(serverRejectedFields(error, SETTINGS_PROPERTY_TO_FIELD));
        if (tutoringReasonOf(error) === 'tutoring.concurrent_update') {
          this.conflict.emit();
        }
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
        afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      },
    });
  }
}
