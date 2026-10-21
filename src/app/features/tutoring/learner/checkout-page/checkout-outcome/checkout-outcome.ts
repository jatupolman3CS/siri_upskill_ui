import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowCounterClockwise, phosphorCheckCircle, phosphorClockCountdown, phosphorProhibit } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { bookingStatusLabelKey } from '../../../data/tutoring-labels';
import type { Booking } from '../../../data/tutoring-learner.models';
import { type TutoringPaymentState, lateResolutionOf } from '../../../data/tutoring-payment.models';

/** The four ways a checkout ends other than "still paying". */
export type CheckoutOutcomeKind = 'confirmed' | 'ended' | 'finalized' | 'refunded';

interface OutcomeLook {
  readonly icon: string;
  readonly tone: string;
}

const LOOKS: Readonly<Record<CheckoutOutcomeKind, OutcomeLook>> = {
  confirmed: { icon: 'phosphorCheckCircle', tone: 'tone-green' },
  ended: { icon: 'phosphorClockCountdown', tone: 'tone-orange' },
  finalized: { icon: 'phosphorProhibit', tone: 'tone-blue' },
  refunded: { icon: 'phosphorArrowCounterClockwise', tone: 'tone-blue' },
};

/**
 * The closing states of `/tutoring/checkout/:bookingId`: confirmed (paid or a free trial), the hold ended or the booking was
 * cancelled, the lesson is already over, or a late / duplicate payment that is being refunded in full. Each says what
 * happened, what happens to any money, and where to go next - and only links to "my lessons" when that page exists.
 * Wording about money follows the server: a late payment is either re-opened (then the booking is `Confirmed`) or refunded.
 */
@Component({
  selector: 'app-checkout-outcome',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe],
  templateUrl: './checkout-outcome.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    provideIcons({ phosphorArrowCounterClockwise, phosphorCheckCircle, phosphorClockCountdown, phosphorProhibit }),
  ],
  host: { class: 'block' },
})
export class CheckoutOutcome {
  readonly kind = input.required<CheckoutOutcomeKind>();
  readonly booking = input.required<Booking>();
  /** Last read of the payment (the refund wording needs its amount, method and late resolution). */
  readonly paymentState = input<TutoringPaymentState | null>(null);
  /** Whether the "my lessons" page exists in this build; its link is hidden until it does. */
  readonly myTutoringAvailable = input(false);

  protected readonly look = computed(() => LOOKS[this.kind()]);
  protected readonly isCancelled = computed(() => {
    const status = this.booking().status;
    return status === 'CancelledByLearner' || status === 'CancelledByTutor';
  });
  protected readonly statusKey = computed(() => bookingStatusLabelKey(this.booking().status));
  protected readonly refundIsDuplicate = computed(() => {
    const state = this.paymentState();
    return state !== null && lateResolutionOf(state) === 'Duplicate';
  });
  protected readonly refundIsConsentWithdrawn = computed(() => {
    return !!this.booking().learner.guardianConsentWithdrawnAtUtc;
  });
  protected readonly refundIsPromptPay = computed(() => this.paymentState()?.method === 'PromptPay');
}
