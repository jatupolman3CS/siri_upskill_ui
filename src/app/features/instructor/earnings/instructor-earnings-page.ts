import { CommonModule, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCalendar,
  phosphorCheckCircle,
  phosphorClock,
  phosphorCurrencyDollar,
  phosphorDownloadSimple,
  phosphorQuestion,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { PayoutApiService } from '../../payout/data/payout-api.service';
import { PayoutPolicyStore } from '../../payout/data/payout-policy.store';
import { PayoutPolicyText } from '../../payout/ui/payout-policy-text/payout-policy-text';
import { payoutBatchItemStatusBadge } from '../../payout/ui/payout-status-badges';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { PayoutAccountCard } from './payout-account-card/payout-account-card';
import { TaxCertificateDialog } from './tax-certificate-dialog/tax-certificate-dialog';

/**
 * `/instructor/earnings` — a money screen (cumulative/latest/estimated payout amounts and the payout history), so it
 * deserves extra scrutiny per CLAUDE.md. Every figure starts undefined/empty and comes from a real server response:
 * a loading skeleton shows while fetching and a real error state with retry shows on failure (`rxResource` without a
 * `defaultValue`, `hasValue()`-guarded reads, following `CourseDetailPage`). The bank (payout) account has its own
 * component, `PayoutAccountCard`, which owns the account fetch, the "no account yet" empty state and the save.
 */
@Component({
  selector: 'app-instructor-earnings-page',
  imports: [CommonModule, NgIcon, CurrencyThbPipe, TranslatePipe, EmptyState, Skeleton, PayoutPolicyText, PayoutAccountCard, TaxCertificateDialog],
  templateUrl: './instructor-earnings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    // CurrencyThbPipe's own inject(CurrencyPipe) needs this — Angular's built-in CurrencyPipe is not
    // providedIn: 'root', and neither this page's InstructorLayout parent nor anything above it in the
    // tree provides one. Every other currencyThb consumer in this codebase (CoursesPage,
    // CourseDetailPage, order-history-page, the admin dashboard/payouts/marketing pages, ...) already
    // does this; this page was missing it, which would have thrown NullInjectorError the first time it
    // actually rendered with real navigation (previously masked because the page always short-circuited
    // straight to its hardcoded fake defaults without ever really being exercised end-to-end).
    CurrencyPipe,
    // One `GET /api/payout/policy` per page load, shared by the header copy and the table headers.
    PayoutPolicyStore,
    provideIcons({
      phosphorCurrencyDollar,
      phosphorCalendar,
      phosphorCheckCircle,
      phosphorClock,
      phosphorDownloadSimple,
      phosphorXCircle,
      // Only reachable for a status the backend does not define (payout-status-badges.ts' unknown fallback).
      phosphorQuestion,
    }),
  ],
})
export class InstructorEarningsPage implements OnInit {
  private readonly payoutApi = inject(PayoutApiService);
  private readonly seoService = inject(SeoService);
  private readonly translation = inject(TranslationService);

  protected readonly earningsResource = rxResource({
    stream: () => this.payoutApi.getInstructorEarningsSummary(),
  });

  protected readonly earningsLoading = computed(() => this.earningsResource.isLoading() && !this.earningsResource.hasValue());
  protected readonly earningsError = computed(() => this.earningsResource.error() !== undefined);
  protected readonly earningsSummary = computed(() => (this.earningsResource.hasValue() ? this.earningsResource.value() : undefined));
  protected readonly payoutHistory = computed(() => this.earningsSummary()?.history ?? []);
  /** Most recent completed transfer (`PayoutBatchItemStatus.Transferred` — the backend never sends "Paid" for a
   *  history row), used for the "latest payout" card's real date. The history arrives newest batch first, and the
   *  server's `latestPayoutAmount` is computed from that same first `Transferred` row. */
  protected readonly latestPaidHistoryItem = computed(() => this.payoutHistory().find((item) => item.status === 'Transferred'));

  /** Payout history table's status badge (label + icon + colour) — one entry per backend `PayoutBatchItemStatus`
   *  (`Pending` / `Transferred` / `Failed`); an unexpected value shows its raw text on a neutral badge. */
  protected readonly payoutStatusBadge = payoutBatchItemStatusBadge;

  /** `payoutId` of the history row whose 50 ทวิ certificate dialog is open, `null` when closed. */
  protected readonly taxCertificateItemId = signal<string | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: this.translation.t('instructor.earnings.pageTitle'),
      description: this.translation.t('instructor.earnings.pageDescription'),
      path: '/instructor/earnings',
      robots: 'noindex',
    });
  }

  protected retryEarnings(): void {
    this.earningsResource.reload();
  }
}
