import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { Modal } from '../../../../shared/modal/modal';
import { Spinner } from '../../../../shared/spinner/spinner';
import { PayoutApiService } from '../../../payout/data/payout-api.service';

/** `ApiError` (what the error interceptor throws) and a raw `HttpErrorResponse` (possibly wrapped by `resource()`) both expose `status`. */
function httpStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return 'cause' in error ? httpStatusOf(error.cause) : undefined;
}

/**
 * Read-only view of one withholding-tax certificate (50 ทวิ). The backend returns the certificate as data (there is no
 * PDF), so the dialog shows those figures. It fetches on open, with loading / error (+ retry) states; the 409 case
 * (payout account or tax id not saved yet) gets its own message because the instructor can fix it on the same page.
 */
@Component({
  selector: 'app-tax-certificate-dialog',
  imports: [Modal, Button, Spinner, TranslatePipe, CurrencyThbPipe, BangkokDatePipe],
  templateUrl: './tax-certificate-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class TaxCertificateDialog {
  private readonly payoutApi = inject(PayoutApiService);

  /** The `payoutId` of the history row whose certificate is shown. */
  readonly batchItemId = input.required<string>();
  readonly closed = output<void>();

  protected readonly certificateResource = rxResource({
    params: () => this.batchItemId(),
    stream: ({ params }) => this.payoutApi.getMyTaxCertificate(params),
  });

  protected readonly certificate = computed(() =>
    this.certificateResource.hasValue() ? this.certificateResource.value() : undefined,
  );

  protected readonly hasError = computed(() => this.certificateResource.error() !== undefined);

  protected readonly errorKey = computed(() =>
    httpStatusOf(this.certificateResource.error()) === 409
      ? 'instructor.earnings.taxCertificate.errorIncomplete'
      : 'instructor.earnings.taxCertificate.errorGeneric',
  );

  protected retry(): void {
    this.certificateResource.reload();
  }
}
