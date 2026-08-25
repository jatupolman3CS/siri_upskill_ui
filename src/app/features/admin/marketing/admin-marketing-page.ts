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
  phosphorCheckCircle,
  phosphorPercent,
  phosphorPlusCircle,
  phosphorSparkle,
  phosphorTag,
  phosphorTrash,
} from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { SeoService } from '../../../core/seo/seo.service';

export interface PromoCodeItem {
  id: string;
  code: string;
  discountType: 'Percentage' | 'FixedAmount';
  discountValue: number;
  minSpendAmount: number;
  usageCount: number;
  maxUsageLimit: number;
  expiresAtUtc: string;
  isActive: boolean;
}

@Component({
  selector: 'app-admin-marketing-page',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe],
  templateUrl: './admin-marketing-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorTag,
      phosphorPlusCircle,
      phosphorSparkle,
      phosphorPercent,
      phosphorTrash,
      phosphorCheckCircle,
    }),
  ],
})
export class AdminMarketingPage implements OnInit {
  private readonly seoService = inject(SeoService);

  protected readonly promos = signal<PromoCodeItem[]>([
    {
      id: 'pr-1',
      code: 'SIRI2026',
      discountType: 'Percentage',
      discountValue: 20,
      minSpendAmount: 1000,
      usageCount: 142,
      maxUsageLimit: 500,
      expiresAtUtc: '2026-12-31T23:59:59Z',
      isActive: true,
    },
    {
      id: 'pr-2',
      code: 'EARLYBIRD',
      discountType: 'FixedAmount',
      discountValue: 500,
      minSpendAmount: 2000,
      usageCount: 88,
      maxUsageLimit: 100,
      expiresAtUtc: '2026-08-31T23:59:59Z',
      isActive: true,
    },
    {
      id: 'pr-3',
      code: 'LAUNCH10',
      discountType: 'Percentage',
      discountValue: 10,
      minSpendAmount: 500,
      usageCount: 300,
      maxUsageLimit: 300,
      expiresAtUtc: '2026-06-30T23:59:59Z',
      isActive: false,
    },
  ]);

  protected readonly showAddModal = signal(false);
  protected readonly newCode = signal('');
  protected readonly newDiscountType = signal<'Percentage' | 'FixedAmount'>('Percentage');
  protected readonly newDiscountValue = signal(15);
  protected readonly newMinSpend = signal(1000);
  protected readonly newMaxUsage = signal(200);

  ngOnInit(): void {
    this.seoService.set({
      title: 'การตลาดและโปรโมชัน | SIRI UpSkill Admin',
      description: 'ระบบจัดการโค้ดส่วนลดและแคมเปญส่งเสริมการขาย',
      path: '/admin/marketing',
      robots: 'noindex',
    });
  }

  protected togglePromoStatus(promo: PromoCodeItem): void {
    this.promos.update((list) =>
      list.map((p) => (p.id === promo.id ? { ...p, isActive: !p.isActive } : p))
    );
  }

  protected createPromo(): void {
    const code = this.newCode().trim().toUpperCase();
    if (!code) return;

    const newPromo: PromoCodeItem = {
      id: `pr-${Date.now()}`,
      code,
      discountType: this.newDiscountType(),
      discountValue: this.newDiscountValue(),
      minSpendAmount: this.newMinSpend(),
      usageCount: 0,
      maxUsageLimit: this.newMaxUsage(),
      expiresAtUtc: '2026-12-31T23:59:59Z',
      isActive: true,
    };

    this.promos.update((list) => [newPromo, ...list]);
    this.newCode.set('');
    this.showAddModal.set(false);
  }
}
