import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { InputField } from '../../../../shared/input/input';
import { ToastService } from '../../../../shared/toast/toast.service';
import { LiveInstructorApiService } from '../../../live/data/live-instructor-api.service';
import type { SetEnrollmentPolicyResponse } from '../../../live/data/live-instructor.models';
import {
  type ProblemMessage,
  bangkokToUtcIso,
  instructorProblemMessage,
  utcToBangkokParts,
} from '../../../live/data/live-instructor.util';
import { problemOf } from '../../../live/data/live.models';

/**
 * Enrollment deadline and seat cap (P11-11). Both are optional — leaving a field empty means "no deadline" / "no cap". The
 * deadline is typed in Asia/Bangkok and sent as a UTC instant with a trailing `Z`; the server owns the rules (e.g. which
 * course states can change it).
 */
@Component({
  selector: 'app-live-policy-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, InputField],
  templateUrl: './live-policy-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class LivePolicyForm {
  private readonly api = inject(LiveInstructorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly courseId = input.required<string>();
  readonly deadlineUtc = input<string | null>(null);
  readonly maxSeats = input<number | null>(null);
  readonly seatsUsed = input(0);
  readonly saved = output<SetEnrollmentPolicyResponse>();

  protected readonly form = new FormGroup({
    deadlineDate: new FormControl('', { nonNullable: true }),
    deadlineTime: new FormControl('', { nonNullable: true }),
    maxSeats: new FormControl('', { nonNullable: true }),
  });
  protected readonly busy = signal(false);
  protected readonly problem = signal<ProblemMessage | null>(null);
  protected readonly fieldErrorKey = signal<string | null>(null);
  protected readonly problemText = computed(() => {
    const message = this.problem();
    return message ? this.i18n.t(message.key, message.params) : null;
  });

  constructor() {
    // Show what the server currently has; refreshed after every save / refetch of the schedule.
    effect(() => {
      const deadline = this.deadlineUtc();
      const seats = this.maxSeats();
      untracked(() => {
        const parts = deadline ? utcToBangkokParts(deadline) : null;
        this.form.reset({
          deadlineDate: parts?.date ?? '',
          deadlineTime: parts?.time ?? '',
          maxSeats: seats === null ? '' : String(seats),
        });
        this.fieldErrorKey.set(null);
      });
    });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    this.problem.set(null);
    this.fieldErrorKey.set(null);
    const { deadlineDate, deadlineTime, maxSeats } = this.form.getRawValue();

    let enrollmentDeadlineUtc: string | null = null;
    if (deadlineDate || deadlineTime) {
      enrollmentDeadlineUtc = bangkokToUtcIso(deadlineDate, deadlineTime);
      if (!enrollmentDeadlineUtc) {
        this.fieldErrorKey.set('live.builder.policy.errorDeadline');
        return;
      }
    }
    let seats: number | null = null;
    if (maxSeats.trim() !== '') {
      seats = Number(maxSeats);
      if (!Number.isInteger(seats) || seats < 1) {
        this.fieldErrorKey.set('live.builder.policy.errorSeats');
        return;
      }
    }

    this.busy.set(true);
    this.api.setEnrollmentPolicy(this.courseId(), { enrollmentDeadlineUtc, maxSeats: seats }).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.toast.success(this.i18n.t('live.builder.policy.saved'));
        this.saved.emit(result);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const status = problemOf(error)?.status;
        this.problem.set(status === 400 ? { key: 'live.builder.policy.errorInvalid' } : instructorProblemMessage(error));
      },
    });
  }
}
