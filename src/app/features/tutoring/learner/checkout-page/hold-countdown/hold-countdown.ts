import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorTimer } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { type CountdownStage, countdownStage, formatCountdown } from '../../../data/tutoring-booking.util';
import type { TutoringPaymentKind } from '../../../data/tutoring-payment.models';

const STAGE_MESSAGE: Readonly<Record<CountdownStage, string>> = {
  plenty: 'tutoring.checkout.countdown.plenty',
  fiveMinutes: 'tutoring.checkout.countdown.fiveMinutes',
  oneMinute: 'tutoring.checkout.countdown.oneMinute',
  over: 'tutoring.checkout.countdown.over',
};
/** A package purchase has a payment window, not a held lesson time, so its first message does not say the time is held. */
const PACKAGE_PLENTY_MESSAGE = 'tutoring.learner.packages.checkout.countdown.plenty';
const STAGE_TONE: Readonly<Record<CountdownStage, string>> = {
  plenty: 'tone-blue',
  fiveMinutes: 'tone-gold',
  oneMinute: 'tone-red',
  over: 'tone-red',
};

/**
 * The "time left to pay" badge. The ticking number is a `role="timer"` (implicitly not announced), and a separate visually
 * hidden status line changes only when the countdown crosses a stage (plenty -> 5 minutes -> 1 minute -> over), so a screen
 * reader hears four short messages instead of a number every second. Colour is never the only signal: the stage message is
 * text, and the icon is decorative.
 */
@Component({
  selector: 'app-hold-countdown',
  imports: [NgIcon, TranslatePipe],
  templateUrl: './hold-countdown.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorTimer })],
  host: { class: 'block' },
})
export class HoldCountdown {
  /** Milliseconds left on the hold (server clock); `null` hides the badge. */
  readonly remainingMs = input.required<number | null>();
  /** What the countdown is for: a held lesson (default) or a package purchase window. */
  readonly kind = input<TutoringPaymentKind>('Booking');

  protected readonly time = computed(() => formatCountdown(this.remainingMs() ?? 0));
  private readonly stage = computed<CountdownStage>(() => countdownStage(this.remainingMs() ?? 0));
  protected readonly stageMessage = computed(() => {
    const stage = this.stage();
    return stage === 'plenty' && this.kind() === 'Package' ? PACKAGE_PLENTY_MESSAGE : STAGE_MESSAGE[stage];
  });
  protected readonly tone = computed(() => STAGE_TONE[this.stage()]);
}
