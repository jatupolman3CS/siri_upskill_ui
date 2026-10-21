import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowsClockwise, phosphorBank, phosphorCheckCircle, phosphorHourglass, phosphorPauseCircle, phosphorWallet } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { TutoringLearnerApiService } from '../../data/tutoring-learner-api.service';
import { TutoringWalletApiService } from '../../data/tutoring-wallet-api.service';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { WalletLedger } from './wallet-ledger/wallet-ledger';
import { WalletPayouts } from './wallet-payouts/wallet-payouts';

const PAGE_PATH = '/instructor/tutoring/wallet';
/** Where the instructor already enters their bank account and tax details (the course earnings page); the wallet links there instead of repeating it. */
const PAYOUT_ACCOUNT_ROUTE = '/instructor/earnings';

/**
 * `/instructor/tutoring/wallet` - what the tutor has earned from lessons and where it stands (P13-25, P13-07): held, frozen by a
 * dispute, available, in a payout run and paid; when the next run is created; the earnings ledger and the weekly payouts. Every
 * figure is the server's. The page explains the rules in plain language - money is held until the lesson is over and the dispute
 * period has passed, the platform commission and the payment fee are applied by the system, payouts run weekly and are paid after
 * an administrator transfers them - and shows the number of hours from the server's own cancellation policy rather than a constant.
 * NOT behind `verifiedTutorGuard`: a suspended tutor must still see the money owed to them (the wallet is `InstructorOnly`).
 */
@Component({
  selector: 'app-tutor-wallet-page',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, EmptyState, Skeleton, TutorPortalNav, WalletLedger, WalletPayouts],
  providers: [
    CurrencyPipe,
    provideIcons({ phosphorArrowsClockwise, phosphorBank, phosphorCheckCircle, phosphorHourglass, phosphorPauseCircle, phosphorWallet }),
  ],
  templateUrl: './tutor-wallet-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorWalletPage {
  private readonly walletApi = inject(TutoringWalletApiService);
  private readonly learnerApi = inject(TutoringLearnerApiService);

  private readonly walletResource = rxResource({ stream: () => this.walletApi.getWallet() });
  /** Only for the hold-period wording; if it fails the note simply loses its number. */
  private readonly policyResource = rxResource({ stream: () => this.learnerApi.getCancellationPolicy() });

  protected readonly wallet = computed(() => (this.walletResource.hasValue() ? this.walletResource.value() : null));
  protected readonly isLoading = computed(() => this.walletResource.isLoading() && !this.walletResource.hasValue());
  protected readonly hasError = computed(() => this.walletResource.status() === 'error');
  protected readonly holdHours = computed(() => (this.policyResource.hasValue() ? this.policyResource.value().disputeWindowHours : null));
  protected readonly accountRoute = PAYOUT_ACCOUNT_ROUTE;

  constructor() {
    trackStudioMeta('tutoring.tutor.wallet.pageTitle', 'tutoring.tutor.wallet.pageDescription', () => PAGE_PATH);
  }

  protected reload(): void {
    this.walletResource.reload();
  }
}
