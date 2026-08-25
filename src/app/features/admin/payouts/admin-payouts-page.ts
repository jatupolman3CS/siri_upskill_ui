import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCalendar,
  phosphorCheckCircle,
  phosphorCurrencyDollar,
  phosphorDownloadSimple,
  phosphorPlus,
} from '@ng-icons/phosphor-icons/regular';

import { PayoutBatchItem } from '../../payout/data/payout-api.models';
import { PayoutApiService } from '../../payout/data/payout-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-admin-payouts-page',
  imports: [CommonModule, NgIcon, CurrencyThbPipe],
  templateUrl: './admin-payouts-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCurrencyDollar,
      phosphorPlus,
      phosphorCheckCircle,
      phosphorDownloadSimple,
      phosphorCalendar,
    }),
  ],
})
export class AdminPayoutsPage implements OnInit {
  private readonly payoutApi = inject(PayoutApiService);
  private readonly seoService = inject(SeoService);

  protected readonly batches = signal<PayoutBatchItem[]>([
    {
      id: 'batch-2026-07',
      batchNumber: 'PAY-202607-001',
      periodStartUtc: '2026-07-01T00:00:00Z',
      periodEndUtc: '2026-07-31T23:59:59Z',
      totalAmount: 185400,
      totalInstructors: 8,
      status: 'Paid',
      executedAtUtc: '2026-08-05T10:00:00Z',
      createdAtUtc: '2026-08-01T00:00:00Z',
    },
    {
      id: 'batch-2026-08',
      batchNumber: 'PAY-202608-001',
      periodStartUtc: '2026-08-01T00:00:00Z',
      periodEndUtc: '2026-08-31T23:59:59Z',
      totalAmount: 142000,
      totalInstructors: 11,
      status: 'Pending',
      executedAtUtc: null,
      createdAtUtc: '2026-08-20T00:00:00Z',
    },
  ]);

  protected readonly isGenerating = signal(false);

  ngOnInit(): void {
    this.seoService.set({
      title: 'จัดการรอบการจ่ายเงิน | SIRI UpSkill Admin',
      description: 'ระบบจัดการรอบการจ่ายเงินและส่วนแบ่งรายได้ผู้สอน',
      path: '/admin/payouts',
      robots: 'noindex',
    });

    this.payoutApi.getAdminPayoutBatches().subscribe({
      next: (res) => {
        if (res.items.length > 0) {
          this.batches.set([...res.items]);
        }
      },
      error: () => {},
    });
  }

  protected generateBatch(): void {
    this.isGenerating.set(true);
    setTimeout(() => {
      const newBatch: PayoutBatchItem = {
        id: `batch-${Date.now()}`,
        batchNumber: `PAY-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-NEW`,
        periodStartUtc: new Date().toISOString(),
        periodEndUtc: new Date().toISOString(),
        totalAmount: 64500,
        totalInstructors: 6,
        status: 'Pending',
        executedAtUtc: null,
        createdAtUtc: new Date().toISOString(),
      };
      this.batches.update((list) => [newBatch, ...list]);
      this.isGenerating.set(false);
    }, 800);
  }
}
