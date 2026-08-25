import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBank,
  phosphorCalendar,
  phosphorCheckCircle,
  phosphorCurrencyDollar,
  phosphorDownloadSimple,
  phosphorPencilSimple,
} from '@ng-icons/phosphor-icons/regular';

import { PayoutHistoryItem } from '../../payout/data/payout-api.models';
import { PayoutApiService } from '../../payout/data/payout-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-instructor-earnings-page',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe],
  templateUrl: './instructor-earnings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCurrencyDollar,
      phosphorBank,
      phosphorCalendar,
      phosphorCheckCircle,
      phosphorDownloadSimple,
      phosphorPencilSimple,
    }),
  ],
})
export class InstructorEarningsPage implements OnInit {
  private readonly payoutApi = inject(PayoutApiService);
  private readonly seoService = inject(SeoService);

  protected readonly cumulativeEarnings = signal(148500);
  protected readonly latestPayout = signal(32400);
  protected readonly estimatedNextPayout = signal(28900);

  protected readonly bankName = signal('ธนาคารกสิกรไทย (KBANK)');
  protected readonly maskedAccountNumber = signal('***-*-*8429-1');
  protected readonly accountHolderName = signal('ดร. อานนท์ พัฒนากุล');

  protected readonly showEditBank = signal(false);
  protected readonly editBankName = signal('ธนาคารกสิกรไทย (KBANK)');
  protected readonly editAccountNumber = signal('');
  protected readonly editAccountHolder = signal('ดร. อานนท์ พัฒนากุล');

  protected readonly history = signal<PayoutHistoryItem[]>([
    {
      payoutId: 'pay-07',
      batchNumber: 'PAY-202607-001',
      grossAmount: 46285,
      netAmount: 32400,
      withholdingTaxAmount: 972,
      periodEndUtc: '2026-07-31T23:59:59Z',
      status: 'Paid',
      paidAtUtc: '2026-08-05T10:00:00Z',
    },
    {
      payoutId: 'pay-06',
      batchNumber: 'PAY-202606-001',
      grossAmount: 41000,
      netAmount: 28700,
      withholdingTaxAmount: 861,
      periodEndUtc: '2026-06-30T23:59:59Z',
      status: 'Paid',
      paidAtUtc: '2026-07-05T10:00:00Z',
    },
  ]);

  ngOnInit(): void {
    this.seoService.set({
      title: 'รายได้และรอบการจ่ายเงิน | Instructor Studio',
      description: 'สรุปรายได้ ส่วนแบ่ง 70/30 และประวัติการรับเงิน',
      path: '/instructor/earnings',
      robots: 'noindex',
    });

    this.payoutApi.getInstructorEarningsSummary().subscribe({
      next: (res) => {
        this.cumulativeEarnings.set(res.cumulativeEarnings);
        this.latestPayout.set(res.latestPayoutAmount);
        this.estimatedNextPayout.set(res.estimatedNextPayoutAmount);
        if (res.history && res.history.length > 0) {
          this.history.set([...res.history]);
        }
      },
      error: () => {},
    });

    this.payoutApi.getMyPayoutAccount().subscribe({
      next: (acc) => {
        if (acc) {
          this.bankName.set(acc.bankCode);
          this.maskedAccountNumber.set(acc.bankAccountNumberMasked);
          this.accountHolderName.set(acc.accountHolderName);
        }
      },
      error: () => {},
    });
  }

  protected saveBankAccount(): void {
    const rawNumber = this.editAccountNumber().trim();
    if (rawNumber.length >= 4) {
      this.maskedAccountNumber.set(`***-*-*${rawNumber.slice(-4)}`);
    }
    this.bankName.set(this.editBankName());
    this.accountHolderName.set(this.editAccountHolder());
    this.showEditBank.set(false);
  }
}
