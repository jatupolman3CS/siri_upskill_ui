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
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonKey, tutoringReasonOf } from '../../../data/tutoring-errors';
import type { Guid } from '../../../data/tutoring-learner.models';
import { TutoringLearnerApiService } from '../../../data/tutoring-learner-api.service';
import type { CancelBookingResponse } from '../../../data/tutoring-my-bookings.models';
import { cancelRuleKey } from './cancel-rule';
import { FieldFeedback, optionalTextIssue, trimToNull } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';

const REASON_MAX = 500;

/**
 * Cancel a booking as its learner (P13-08 sections 5.2 - 5.3, 12). On opening, the dialog asks the SERVER what cancelling would do
 * right now and shows exactly that - the amount paid, the refund, the part that is kept for the tutor's time and the rule that
 * applied, in plain words, plus the general policy from the server's configuration. None of those figures is computed here.
 * <para>
 * Confirming sends the refund the learner saw as `expectedRefundAmount`. If the free-cancellation moment passed while they were
 * reading, the server answers `cancellation_quote_changed` with the amounts that now apply: the dialog shows them and asks for a
 * second, explicit confirmation - a learner is never charged a different amount than the one they agreed to. Repeating a cancel
 * that already went through is harmless (the server answers "already cancelled"), and the button cannot be pressed twice while
 * the request is in flight. A refund is not instant: the receipt says what happens next, including that a PromptPay refund is
 * paid back by bank transfer after Stripe e-mails for the account details. A destructive action, so a click on the backdrop does
 * not dismiss it.
 * </para>
 */
@Component({
  selector: 'app-cancel-booking-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, Modal, Skeleton, TutorProblem, TutorTextarea],
  templateUrl: './cancel-booking-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class CancelBookingDialog {
  private readonly api = inject(TutoringLearnerApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly bookingId = input.required<Guid>();
  /** The lesson was booked with a package credit: the dialog says what happens to the credit as well as to any money. */
  readonly packageBooking = input(false);
  readonly cancelled = output<CancelBookingResponse>();

  protected readonly reasonMax = REASON_MAX;
  protected readonly ruleKey = cancelRuleKey;
  protected readonly statusKey = (status: string): string => `tutoring.learner.my.refund.status.${status}`;

  /** Fetched afresh every time the dialog opens: a stale quote could promise a refund that is no longer due. */
  private readonly quoteResource = rxResource({
    params: () => (this.open() ? this.bookingId() : undefined),
    stream: ({ params }) => this.api.getCancellationQuote(params),
  });
  /** The general policy (public, from server configuration) - context only; the quote is what applies. */
  private readonly policyResource = rxResource({
    params: () => (this.open() ? true : undefined),
    stream: () => this.api.getCancellationPolicy(),
  });
  protected readonly quote = computed(() => (this.quoteResource.hasValue() ? this.quoteResource.value() : null));
  protected readonly policy = computed(() => (this.policyResource.hasValue() ? this.policyResource.value() : null));
  protected readonly quoteLoading = computed(() => this.open() && this.quoteResource.isLoading() && !this.quoteResource.hasValue());
  protected readonly quoteFailed = computed(() => this.quoteResource.status() === 'error');
  protected readonly refusalKey = computed(() => {
    const quote = this.quote();
    return quote !== null && !quote.canCancel ? tutoringReasonKey(quote.refusalReason) : null;
  });

  /** The amounts that now apply after a `cancellation_quote_changed` answer; they replace the quote's for the second confirmation. */
  private readonly changed = signal<{ readonly refundAmount: number; readonly retainedAmount: number } | null>(null);
  protected readonly amounts = computed(() => {
    const quote = this.quote();
    const override = this.changed();
    return quote === null ? null : { refundAmount: override?.refundAmount ?? quote.refundAmount, retainedAmount: override?.retainedAmount ?? quote.retainedAmount };
  });

  /** `true` once the server has answered with new amounts: the confirm button then asks for the second confirmation. */
  protected readonly changedNotice = computed(() => this.changed() !== null);

  protected readonly reason = new FormControl('', { nonNullable: true });
  private readonly reasonValue = toSignal(this.reason.valueChanges.pipe(startWith('')), { requireSync: true });
  protected readonly feedback = new FieldFeedback<'reason'>();
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly result = signal<CancelBookingResponse | null>(null);
  protected readonly reasonError = computed(() => {
    const found = optionalTextIssue(this.reasonValue(), REASON_MAX);
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
          this.changed.set(null);
        });
      }
    });
  }

  protected retryQuote(): void {
    this.quoteResource.reload();
  }

  protected submit(): void {
    const amounts = this.amounts();
    if (this.busy() || this.result() !== null || amounts === null || this.quote()?.canCancel !== true) {
      return;
    }
    this.feedback.attempt();
    if (optionalTextIssue(this.reasonValue(), REASON_MAX) !== undefined) {
      return;
    }
    this.problem.set(null);
    this.busy.set(true);
    this.api.cancelBooking(this.bookingId(), { reason: trimToNull(this.reasonValue()), expectedRefundAmount: amounts.refundAmount }).subscribe({
      next: (done) => {
        this.busy.set(false);
        this.result.set(done);
        this.toast.success(this.i18n.t(done.alreadyCancelled ? 'tutoring.learner.my.cancel.alreadyDone' : 'tutoring.learner.my.cancel.done'));
        this.cancelled.emit(done);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.onFailed(error);
      },
    });
  }

  private onFailed(error: unknown): void {
    const detail = tutoringProblemOf(error);
    if (tutoringReasonOf(error) === 'tutoring.cancellation_quote_changed' && typeof detail?.refundAmount === 'number' && typeof detail.retainedAmount === 'number') {
      this.changed.set({ refundAmount: detail.refundAmount, retainedAmount: detail.retainedAmount });
      this.problem.set(this.i18n.t('tutoring.learner.my.cancel.quoteChanged'));
      return;
    }
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
  }
}
