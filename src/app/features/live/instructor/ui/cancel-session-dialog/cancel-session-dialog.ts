import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { LiveInstructorApiService } from '../../../data/live-instructor-api.service';
import type { LiveSession } from '../../../data/live-instructor.models';
import { type ProblemMessage, instructorProblemMessage } from '../../../data/live-instructor.util';

export const CANCEL_REASON_MAX_LENGTH = 500;

let nextDialogId = 0;

/**
 * Confirm + reason dialog for cancelling one live session (`POST …/live-sessions/{id}/cancel`, a reason is required by the
 * API and learners see it). Destructive, so backdrop-click does not dismiss it.
 */
@Component({
  selector: 'app-live-cancel-session-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Modal],
  templateUrl: './cancel-session-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelSessionDialog {
  private readonly api = inject(LiveInstructorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly courseId = input.required<string>();
  readonly sessionId = input.required<string>();
  readonly sessionTitle = input.required<string>();
  readonly cancelled = output<LiveSession>();

  protected readonly maxLength = CANCEL_REASON_MAX_LENGTH;
  protected readonly fieldId = `cancel-reason-${nextDialogId++}`;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(CANCEL_REASON_MAX_LENGTH)],
  });
  protected readonly busy = signal(false);
  protected readonly touched = signal(false);
  protected readonly problem = signal<ProblemMessage | null>(null);

  protected readonly showRequiredError = computed(() => this.touched() && this.reason.invalid);
  protected readonly problemText = computed(() => {
    const message = this.problem();
    return message ? this.i18n.t(message.key, message.params) : null;
  });

  constructor() {
    // Every time the dialog opens it starts clean — a previous attempt's text/error must not leak into the next one.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.reason.reset('');
          this.touched.set(false);
          this.problem.set(null);
        });
      }
    });
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.touched.set(true);
    if (this.reason.invalid) {
      return;
    }
    this.problem.set(null);
    this.busy.set(true);
    this.api.cancelSession(this.courseId(), this.sessionId(), this.reason.value.trim()).subscribe({
      next: (session) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.success(this.i18n.t('live.instructor.cancel.done'));
        this.cancelled.emit(session);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.problem.set(instructorProblemMessage(error));
      },
    });
  }
}
