import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCreditCard, phosphorQrCode } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import type { TutoringPaymentMethod } from '../../../data/tutoring-payment.models';

let nextGroupId = 0;

/**
 * Pick how to pay: PromptPay QR (the default) or card when the server has switched it on. Native radio inputs inside labels,
 * so the arrow keys, the group name and "selected" are announced by the platform; the card look is only paint on top.
 */
@Component({
  selector: 'app-payment-method-choice',
  imports: [NgIcon, TranslatePipe],
  templateUrl: './payment-method-choice.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCreditCard, phosphorQrCode })],
  host: { class: 'block' },
})
export class PaymentMethodChoice {
  /** The methods the server currently offers, in display order. */
  readonly methods = input.required<readonly TutoringPaymentMethod[]>();
  readonly selected = model.required<TutoringPaymentMethod>();
  readonly disabled = input(false);

  protected readonly groupName = `tutoring-payment-method-${nextGroupId++}`;
}
