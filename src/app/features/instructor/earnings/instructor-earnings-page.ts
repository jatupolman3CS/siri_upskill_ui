import { CommonModule, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBank,
  phosphorCalendar,
  phosphorCheckCircle,
  phosphorClock,
  phosphorCurrencyDollar,
  phosphorDownloadSimple,
  phosphorPencilSimple,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { InstructorPayoutAccount } from '../../payout/data/payout-api.models';
import { PayoutApiService } from '../../payout/data/payout-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';

/**
 * `/instructor/earnings` — a money + PII screen (cumulative/latest/estimated payout amounts, bank
 * account number, account holder name), so this deserves extra scrutiny per CLAUDE.md. Previously every
 * one of those fields defaulted to fabricated, hardcoded values (fake THB figures, a fake bank name, a
 * fake masked account number, a fake account holder name, 2 fake payout history rows) and BOTH fetch
 * calls (`getInstructorEarningsSummary`, `getMyPayoutAccount`) had no-op error handlers that silently
 * left those fake defaults on screen forever with nothing distinguishing them from real data — an
 * instructor could see completely fabricated income and bank details and have no way to tell. Rebuilt
 * on two independent `rxResource`s (following `CourseDetailPage`'s "no `defaultValue`, `.value()` is
 * `T | undefined`, `hasValue()`-guarded reads" shape — there is no meaningful "empty" instance of either
 * response to fabricate): every figure starts undefined/empty, a loading skeleton shows while fetching,
 * and a real error state with retry shows on failure. `saveBankAccount()`'s own error handling was
 * already correct (surfaces the real API error message) and is unchanged; its success path now writes
 * the confirmed server response into `payoutAccountResource` via `WritableResource.set()` instead of a
 * separate local signal, so the displayed account details always come from a real server response
 * (either the initial GET or a confirmed save), never a fabricated default.
 */
@Component({
  selector: 'app-instructor-earnings-page',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe, TranslatePipe, EmptyState, Skeleton],
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
    provideIcons({
      phosphorCurrencyDollar,
      phosphorBank,
      phosphorCalendar,
      phosphorCheckCircle,
      phosphorClock,
      phosphorDownloadSimple,
      phosphorPencilSimple,
      phosphorXCircle,
    }),
  ],
})
export class InstructorEarningsPage implements OnInit {
  private readonly payoutApi = inject(PayoutApiService);
  private readonly seoService = inject(SeoService);

  protected readonly earningsResource = rxResource({
    stream: () => this.payoutApi.getInstructorEarningsSummary(),
  });

  protected readonly earningsLoading = computed(() => this.earningsResource.isLoading() && !this.earningsResource.hasValue());
  protected readonly earningsError = computed(() => this.earningsResource.error() !== undefined);
  protected readonly earningsSummary = computed(() => (this.earningsResource.hasValue() ? this.earningsResource.value() : undefined));
  protected readonly payoutHistory = computed(() => this.earningsSummary()?.history ?? []);
  /** Most recent paid record, used for the "latest payout" card's real date instead of the fabricated,
   *  hardcoded month/date that used to live directly in the template. */
  protected readonly latestPaidHistoryItem = computed(() => this.payoutHistory().find((item) => item.status === 'Paid'));

  /** Payout history table's status badge — mirrors `OrderHistoryPage.getStatusBadgeClass()`'s
   *  switch-per-status shape. `PayoutHistoryItem.status` is a plain `string` on the wire, but the only
   *  values the backend's `PayoutBatchItemStatus` enum ever serializes are `Pending`/`Transferred`/
   *  `Failed` (see `Siri.Modules.Payout.Domain.PayoutBatchItemStatus` in the backend repo) — every row
   *  used to show a hardcoded "โอนเงินแล้ว"/paid badge regardless of its real status. */
  protected getPayoutStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Transferred':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
      case 'Pending':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
      case 'Failed':
      default:
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20';
    }
  }

  protected getPayoutStatusIcon(status: string): string {
    switch (status) {
      case 'Transferred':
        return 'phosphorCheckCircle';
      case 'Pending':
        return 'phosphorClock';
      case 'Failed':
      default:
        return 'phosphorXCircle';
    }
  }

  protected readonly payoutAccountResource = rxResource({
    stream: () => this.payoutApi.getMyPayoutAccount(),
  });

  protected readonly payoutAccountLoading = computed(() => this.payoutAccountResource.isLoading() && !this.payoutAccountResource.hasValue());
  protected readonly payoutAccountError = computed(() => this.payoutAccountResource.error() !== undefined);

  protected readonly bankName = computed(() => (this.payoutAccountResource.hasValue() ? this.payoutAccountResource.value().bankCode : null));
  protected readonly maskedAccountNumber = computed(() =>
    this.payoutAccountResource.hasValue() ? this.payoutAccountResource.value().bankAccountNumberMasked : null,
  );
  protected readonly accountHolderName = computed(() =>
    this.payoutAccountResource.hasValue() ? this.payoutAccountResource.value().accountHolderName : null,
  );

  protected readonly showEditBank = signal(false);
  protected readonly editBankName = signal('');
  protected readonly editAccountNumber = signal('');
  protected readonly editAccountHolder = signal('');
  protected readonly isSavingBank = signal(false);
  protected readonly saveBankError = signal<string | null>(null);
  protected readonly saveBankSuccess = signal(false);

  ngOnInit(): void {
    this.seoService.set({
      title: 'รายได้และรอบการจ่ายเงิน | Instructor Studio',
      description: 'สรุปรายได้ ส่วนแบ่ง 70/30 และประวัติการรับเงิน',
      path: '/instructor/earnings',
      robots: 'noindex',
    });
  }

  protected retryEarnings(): void {
    this.earningsResource.reload();
  }

  protected retryPayoutAccount(): void {
    this.payoutAccountResource.reload();
  }

  protected openEditBank(): void {
    this.saveBankError.set(null);
    this.editBankName.set(this.bankName() ?? '');
    this.editAccountHolder.set(this.accountHolderName() ?? '');
    this.editAccountNumber.set('');
    this.showEditBank.set(true);
  }

  protected saveBankAccount(): void {
    const rawNumber = this.editAccountNumber().trim();
    const bankName = this.editBankName().trim();
    const holder = this.editAccountHolder().trim();

    if (!bankName || !rawNumber || !holder) {
      this.saveBankError.set('กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน');
      return;
    }

    if (rawNumber.length < 8) {
      this.saveBankError.set('เลขที่บัญชีต้องมีอย่างน้อย 8 หลัก');
      return;
    }

    this.isSavingBank.set(true);
    this.saveBankError.set(null);

    this.payoutApi
      .upsertPayoutAccount({
        bankName,
        accountNumber: rawNumber,
        accountHolderName: holder,
      })
      .subscribe({
        next: (acc) => {
          this.isSavingBank.set(false);
          // Write the confirmed server response straight into the resource's cache (WritableResource's
          // own `.set()` — see this class's own doc comment) instead of a separate local signal, so the
          // displayed account always reflects a real server-confirmed value, never a locally-fabricated
          // one. The `||` fallbacks mirror the pre-existing defensive behavior for a response that
          // echoes back an empty field.
          const savedAccount: InstructorPayoutAccount = {
            ...acc,
            bankCode: acc.bankCode || bankName,
            bankAccountNumberMasked: acc.bankAccountNumberMasked || `***-*-*${rawNumber.slice(-4)}`,
            accountHolderName: acc.accountHolderName || holder,
          };
          this.payoutAccountResource.set(savedAccount);
          this.showEditBank.set(false);
          this.saveBankSuccess.set(true);
          setTimeout(() => this.saveBankSuccess.set(false), 3000);
        },
        error: (err) => {
          this.isSavingBank.set(false);
          this.saveBankError.set(err?.error?.detail || err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลบัญชี');
        },
      });
  }
}
