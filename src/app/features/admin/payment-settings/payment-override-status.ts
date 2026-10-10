import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorWarning } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PaymentAmountOverrideState } from './data/payment-amount-override.models';
import { shortId } from './payment-override-form.util';

/**
 * Top-of-page answer to "are customers being charged the real price right now?". ACTIVE is deliberately loud (warning
 * border, large amount, warning icon AND the word ACTIVE — never colour alone) because it means real money is being
 * charged a different amount. The wrapper is a polite live region so the switch is announced after a save.
 */
@Component({
  selector: 'app-payment-override-status',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe],
  templateUrl: './payment-override-status.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorWarning })],
  host: { class: 'block' },
})
export class PaymentOverrideStatus {
  readonly state = input.required<PaymentAmountOverrideState>();

  protected readonly active = computed(() => this.state().isEnabled);
  /** Absent before the setting was ever changed. */
  protected readonly changedBy = computed(() => {
    const id = this.state().changedByUserId;
    return id ? { short: shortId(id), full: id } : null;
  });
}
