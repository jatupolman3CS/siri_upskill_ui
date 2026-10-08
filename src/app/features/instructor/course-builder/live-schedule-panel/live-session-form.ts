import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { InputField } from '../../../../shared/input/input';
import { ToastService } from '../../../../shared/toast/toast.service';
import { LiveInstructorApiService } from '../../../live/data/live-instructor-api.service';
import type { LiveSession, LiveSessionWriteRequest } from '../../../live/data/live-instructor.models';
import {
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  type ProblemMessage,
  addDaysToDate,
  bangkokToUtcIso,
  minutesBetween,
  sessionWriteProblemMessage,
  utcToBangkokParts,
} from '../../../live/data/live-instructor.util';

let nextFormId = 0;

/**
 * Add / edit one live session. The instructor types Asia/Bangkok wall-clock date and times; they are converted to UTC
 * instants with a trailing `Z` before anything is sent (never an offset like `+07:00`). An end time at or before the start
 * time is read as the next day. Length (15 min – 8 h) is pre-checked here for a faster message — the server decides.
 */
@Component({
  selector: 'app-live-session-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, InputField],
  templateUrl: './live-session-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class LiveSessionForm {
  private readonly api = inject(LiveInstructorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly courseId = input.required<string>();
  /** `null` = creating a new session. */
  readonly session = input<LiveSession | null>(null);
  readonly saved = output<LiveSession>();
  readonly closed = output<void>();

  protected readonly descriptionId = `live-session-description-${nextFormId++}`;
  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    startTime: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endTime: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly problem = signal<ProblemMessage | null>(null);
  protected readonly timeErrorKey = signal<string | null>(null);

  protected readonly isEditing = computed(() => this.session() !== null);
  protected readonly problemText = computed(() => {
    const message = this.problem();
    return message ? this.i18n.t(message.key, message.params) : null;
  });

  constructor() {
    // Load the session being edited (or reset for a new one) whenever the target changes.
    effect(() => {
      const session = this.session();
      untracked(() => this.load(session));
    });
  }

  protected showError(name: 'title' | 'date' | 'startTime' | 'endTime'): string | undefined {
    const control = this.form.controls[name];
    return this.submitted() && control.invalid ? this.i18n.t('live.builder.form.required') : undefined;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    this.submitted.set(true);
    this.problem.set(null);
    this.timeErrorKey.set(null);
    if (this.form.invalid) {
      return;
    }
    const request = this.buildRequest();
    if (!request) {
      return;
    }
    this.busy.set(true);
    const editing = this.session();
    const call = editing
      ? this.api.updateSession(this.courseId(), editing.id, request)
      : this.api.createSession(this.courseId(), request);
    call.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.toast.success(this.i18n.t(this.isEditing() ? 'live.builder.form.updated' : 'live.builder.form.created'));
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.problem.set(sessionWriteProblemMessage(error));
      },
    });
  }

  private buildRequest(): LiveSessionWriteRequest | null {
    const { title, description, date, startTime, endTime } = this.form.getRawValue();
    const startsAtUtc = bangkokToUtcIso(date, startTime);
    // An end time at or before the start time means the session runs past midnight.
    const endDate = endTime <= startTime ? addDaysToDate(date, 1) : date;
    const endsAtUtc = endDate ? bangkokToUtcIso(endDate, endTime) : null;
    if (!startsAtUtc || !endsAtUtc) {
      this.timeErrorKey.set('live.builder.form.errorTime');
      return null;
    }
    const minutes = minutesBetween(startsAtUtc, endsAtUtc);
    if (minutes === null || minutes < MIN_SESSION_MINUTES || minutes > MAX_SESSION_MINUTES) {
      this.timeErrorKey.set('live.builder.form.errorLength');
      return null;
    }
    return { title: title.trim(), description: description.trim() || null, startsAtUtc, endsAtUtc };
  }

  private load(session: LiveSession | null): void {
    this.submitted.set(false);
    this.problem.set(null);
    this.timeErrorKey.set(null);
    if (!session) {
      this.form.reset({ title: '', description: '', date: '', startTime: '', endTime: '' });
      return;
    }
    const start = utcToBangkokParts(session.startsAtUtc);
    const end = utcToBangkokParts(session.endsAtUtc);
    this.form.reset({
      title: session.title,
      description: session.description ?? '',
      date: start?.date ?? '',
      startTime: start?.time ?? '',
      endTime: end?.time ?? '',
    });
  }
}
