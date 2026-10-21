import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import type { CancelClassResponse, Guid } from '../../../data/tutoring-classes.models';
import { TutoringClassesApiService } from '../../../data/tutoring-classes-api.service';
import { tutoringErrorKey, tutoringReasonKey } from '../../../data/tutoring-errors';
import { penaltyKindLabelKey, refundSettlementLabelKey, refundStatusLabelKey } from '../../../data/tutoring-tutor-labels';
import { FieldFeedback } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { CANCEL_REASON_LIMITS, cancelReasonIssue } from '../../tutor-class-form.util';

/**
 * Cancel one class as its tutor (P13-25). The dialog opens by asking the SERVER what cancelling would cost RIGHT NOW - how many
 * learners are affected, how much is refunded, the reliability-score penalty and whether it would suspend the account - and shows
 * exactly that before the tutor confirms. None of those figures is computed here. A reason (3-500 characters) is required.
 * Destructive, so a click on the backdrop does not dismiss it. This is the one class action open to a tutor who is currently
 * suspended (`InstructorOnly` on the server), so the dialog works without the rest of the class page. After the cancellation
 * the dialog turns into the receipt: refunds per booking and the new score.
 */
@Component({
  selector: 'app-class-cancel-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, Modal, Skeleton, TutorProblem, TutorTextarea],
  templateUrl: './class-cancel-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class ClassCancelDialog {
  private readonly api = inject(TutoringClassesApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly sessionId = input.required<Guid>();
  readonly cancelled = output<CancelClassResponse>();

  protected readonly limits = CANCEL_REASON_LIMITS;
  protected readonly penaltyKey = penaltyKindLabelKey;
  protected readonly settlementKey = refundSettlementLabelKey;
  protected readonly refundStatusKey = refundStatusLabelKey;

  /** Fetched afresh every time the dialog opens: a stale quote could understate the penalty. */
  private readonly quoteResource = rxResource({
    params: () => (this.open() ? this.sessionId() : undefined),
    stream: ({ params }) => this.api.getCancellationQuote(params),
  });
  protected readonly quote = computed(() => (this.quoteResource.hasValue() ? this.quoteResource.value() : null));
  protected readonly quoteLoading = computed(() => this.open() && this.quoteResource.isLoading() && !this.quoteResource.hasValue());
  protected readonly quoteFailed = computed(() => this.quoteResource.status() === 'error');
  protected readonly refusalKey = computed(() => {
    const quote = this.quote();
    return quote !== null && !quote.canCancel ? tutoringReasonKey(quote.refusalReason) : null;
  });

  protected readonly reason = new FormControl('', { nonNullable: true });
  private readonly reasonValue = toSignal(this.reason.valueChanges.pipe(startWith('')), { requireSync: true });
  protected readonly feedback = new FieldFeedback<'reason'>();
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly result = signal<CancelClassResponse | null>(null);
  protected readonly reasonError = computed(() => {
    const found = cancelReasonIssue(this.reasonValue());
    return found === undefined ? undefined : this.feedback.messageFor('reason', { reason: found }, this.i18n);
  });

  constructor() {
    // Every time the dialog opens it starts clean - the previous attempt's text, error and receipt must not leak into the next.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.reason.reset('');
          this.feedback.reset();
          this.problem.set(null);
          this.result.set(null);
        });
      }
    });
  }

  protected retryQuote(): void {
    this.quoteResource.reload();
  }

  protected submit(): void {
    if (this.busy() || this.result() !== null) {
      return;
    }
    this.feedback.attempt();
    if (cancelReasonIssue(this.reasonValue()) !== undefined) {
      return;
    }
    this.problem.set(null);
    this.busy.set(true);
    this.api.cancelClass(this.sessionId(), { reason: this.reasonValue().trim() }).subscribe({
      next: (done) => {
        this.busy.set(false);
        this.result.set(done);
        this.toast.success(this.i18n.t('tutoring.tutor.classes.cancel.done'));
        this.cancelled.emit(done);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
