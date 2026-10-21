import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ledgerKindLabelKey, ledgerSourceLabelKey, ledgerStateLabelKey, ledgerStateTone } from '../../../data/tutoring-tutor-labels';
import { TutoringWalletApiService } from '../../../data/tutoring-wallet-api.service';
import type { TutorLedgerRow } from '../../../data/tutoring-wallet.models';

const PAGE_SIZE = 10;

/**
 * The tutor's earnings ledger (P13-07): one row per lesson, or per adjustment, with the split the server applied - what the
 * learner paid, the payment provider's fee, the platform commission and the tutor's share - and where the money stands (held,
 * in the dispute window, frozen, available, in a payout run, paid, reversed). Every figure is read from the server's row; the
 * table adds nothing up and rounds nothing. A negative share is a refund taken back and is carried to the next payout.
 */
@Component({
  selector: 'app-wallet-ledger',
  imports: [TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, EmptyState, Pagination, Skeleton],
  providers: [CurrencyPipe],
  templateUrl: './wallet-ledger.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class WalletLedger {
  private readonly api = inject(TutoringWalletApiService);

  protected readonly page = signal(1);
  private readonly ledgerResource = rxResource({ params: () => this.page(), stream: ({ params }) => this.api.getLedger(params, PAGE_SIZE) });
  protected readonly rows = computed<readonly TutorLedgerRow[]>(() => (this.ledgerResource.hasValue() ? this.ledgerResource.value().items : []));
  protected readonly totalPages = computed(() => (this.ledgerResource.hasValue() ? this.ledgerResource.value().totalPages : 1));
  protected readonly isLoading = computed(() => this.ledgerResource.isLoading() && !this.ledgerResource.hasValue());
  protected readonly hasError = computed(() => this.ledgerResource.status() === 'error');

  protected readonly stateKey = ledgerStateLabelKey;
  protected readonly stateTone = ledgerStateTone;
  protected readonly kindKey = ledgerKindLabelKey;
  protected readonly sourceKey = ledgerSourceLabelKey;

  protected reload(): void {
    this.ledgerResource.reload();
  }
}
