import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorVideoCamera, phosphorXCircle } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { LiveCountdown } from '../../../../live/learner/live-countdown/live-countdown';
import type { Booking } from '../../../data/tutoring-learner.models';
import { joinCue, joinRoute } from '../../../data/tutoring-my.util';
import { CancelBookingDialog } from '../cancel-booking-dialog/cancel-booking-dialog';
import { ConfirmCompletedDialog } from '../confirm-completed-dialog/confirm-completed-dialog';

/**
 * What a learner can DO with one booking, as buttons: pay, join, cancel, confirm the class went well. Which of them appear is
 * driven by the status and by the server's hints (`canJoin`, `attendance.canConfirmCompleted`); the right to do any of them is
 * decided by the server when the button is pressed (the join page, the cancel quote, the confirm call), so a stale button can
 * at worst earn a polite refusal. Cancelling is offered for the two cancellable statuses only; its dialog asks the server what
 * it would refund before anything is confirmed.
 */
@Component({
  selector: 'app-booking-actions',
  imports: [RouterLink, NgIcon, TranslatePipe, Button, LiveCountdown, CancelBookingDialog, ConfirmCompletedDialog],
  templateUrl: './booking-actions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorVideoCamera, phosphorXCircle })],
  host: { class: 'block' },
})
export class BookingActions {
  readonly booking = input.required<Booking>();
  /** `serverNow - deviceNow` in ms, from the booking's `serverTimeUtc`. */
  readonly offsetMs = input(0);
  /** Something changed on the server (cancelled, confirmed, join window opened): the page should read the booking again. */
  readonly changed = output<void>();

  protected readonly cancelOpen = signal(false);
  protected readonly confirmOpen = signal(false);

  protected readonly cue = computed(() => joinCue(this.booking(), Date.now() + this.offsetMs()));
  protected readonly joinLink = computed(() => joinRoute(this.booking().sessionId));
  protected readonly canCancel = computed(() => this.booking().status === 'PendingPayment' || this.booking().status === 'Confirmed');
  protected readonly canConfirm = computed(() => this.booking().attendance?.canConfirmCompleted === true);
  protected readonly isEmpty = computed(
    () => this.booking().status !== 'PendingPayment' && this.cue().kind === 'none' && !this.canCancel() && !this.canConfirm(),
  );
}
