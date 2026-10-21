import { ChangeDetectionStrategy, Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import type { Guid, IsoUtc } from '../../../data/tutoring-learner.models';
import { TutoringLearnerApiService } from '../../../data/tutoring-learner-api.service';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/**
 * "The class went well" (P13-10 section 6.3) - pays the tutor now instead of after the problem-report window. It is explained
 * before it is offered, because it moves money: the learner is told that the payment is released to the tutor straight away,
 * that nothing here replaces reporting a problem, and until when a problem can still be reported. Whether the booking can be
 * confirmed at all is the server's: the button is only offered when `attendance.canConfirmCompleted` says so, and a refusal
 * (`confirm_not_available`) is shown as the server gave it. Destructive in effect (it cannot be taken back), so the backdrop does
 * not dismiss it, and a second press while the request is in flight does nothing.
 */
@Component({
  selector: 'app-confirm-completed-dialog',
  imports: [TranslatePipe, BangkokDatePipe, Button, Modal, TutorProblem],
  templateUrl: './confirm-completed-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmCompletedDialog {
  private readonly api = inject(TutoringLearnerApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly bookingId = input.required<Guid>();
  /** Until when a problem can still be reported (the server's window), when it has one. */
  readonly disputeWindowEndsAtUtc = input<IsoUtc | null>(null);
  readonly confirmed = output<void>();

  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly done = signal(false);

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.problem.set(null);
          this.done.set(false);
        });
      }
    });
  }

  protected submit(): void {
    if (this.busy() || this.done()) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    this.api.confirmCompleted(this.bookingId()).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.set(true);
        this.toast.success(this.i18n.t('tutoring.learner.my.confirm.done'));
        this.confirmed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
