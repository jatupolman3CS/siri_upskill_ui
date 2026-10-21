import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorClock, phosphorDownloadSimple, phosphorQuestion, phosphorXCircle } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { TaxCertificateDialog } from '../../../../instructor/earnings/tax-certificate-dialog/tax-certificate-dialog';
import { payoutBatchItemStatusBadge } from '../../../../payout/ui/payout-status-badges';
import { TutoringWalletApiService } from '../../../data/tutoring-wallet-api.service';
import type { TutoringPayoutHistoryItem } from '../../../data/tutoring-wallet.models';

const PAGE_SIZE = 10;

/**
 * Weekly payout runs the tutor has been included in (P13-07), with the withholding tax taken and the net amount, and a link to
 * the withholding-tax certificate (50 tawi) of a transferred run. The certificate is served by the EXISTING instructor payout
 * endpoint and shown by the existing dialog - this component adds no certificate logic. Statuses use the shared payout badges
 * (icon + words), so a run reads the same here and on the course earnings page.
 */
@Component({
  selector: 'app-wallet-payouts',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, EmptyState, Pagination, Skeleton, TaxCertificateDialog],
  providers: [CurrencyPipe, provideIcons({ phosphorCheckCircle, phosphorClock, phosphorDownloadSimple, phosphorQuestion, phosphorXCircle })],
  templateUrl: './wallet-payouts.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class WalletPayouts {
  private readonly api = inject(TutoringWalletApiService);

  protected readonly page = signal(1);
  private readonly payoutsResource = rxResource({ params: () => this.page(), stream: ({ params }) => this.api.getPayouts(params, PAGE_SIZE) });
  protected readonly rows = computed<readonly TutoringPayoutHistoryItem[]>(() => (this.payoutsResource.hasValue() ? this.payoutsResource.value().items : []));
  protected readonly totalPages = computed(() => (this.payoutsResource.hasValue() ? this.payoutsResource.value().totalPages : 1));
  protected readonly isLoading = computed(() => this.payoutsResource.isLoading() && !this.payoutsResource.hasValue());
  protected readonly hasError = computed(() => this.payoutsResource.status() === 'error');

  protected readonly badge = payoutBatchItemStatusBadge;
  /** `batchItemId` whose certificate dialog is open; `null` when closed. */
  protected readonly certificateId = signal<string | null>(null);

  protected reload(): void {
    this.payoutsResource.reload();
  }
}
