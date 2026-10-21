import { CurrencyPipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Spinner } from '../../../../../shared/spinner/spinner';
import type { TutoringPayment } from '../../../data/tutoring-payment.models';

/**
 * The PromptPay QR step: the QR the server created for this attempt, the amount it was created for (the server's, read back
 * from the payment), what to do, and a quiet "waiting" line. The page polls the payment in the background and switches view
 * by itself when the signed webhook has confirmed it - nothing here (and no redirect) claims the payment succeeded.
 */
@Component({
  selector: 'app-promptpay-panel',
  imports: [NgOptimizedImage, TranslatePipe, CurrencyThbPipe, Spinner],
  templateUrl: './promptpay-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'block' },
})
export class PromptPayPanel {
  readonly payment = input.required<TutoringPayment>();
  /** The booking number printed as the payment reference; a package purchase has none to show. */
  readonly bookingNo = input<string | null>(null);
}
