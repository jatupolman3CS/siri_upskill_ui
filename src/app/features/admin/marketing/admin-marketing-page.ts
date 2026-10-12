import { CommonModule, CurrencyPipe } from '@angular/common';
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
  phosphorClock,
  phosphorFolder,
  phosphorLightning,
  phosphorPercent,
  phosphorPlusCircle,
  phosphorSparkle,
  phosphorTag,
  phosphorTrash,
  phosphorWarning,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import {
  BundleResponse,
  CreateBundleRequest,
  CreateFlashSaleRequest,
  CreatePromoCodeRequest,
  FlashSaleResponse,
  PromoCodeDiscountType,
  PromoCodeItem,
} from './data/admin-marketing-api.models';
import { AdminMarketingApiService } from './data/admin-marketing-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-marketing-page',
  imports: [CommonModule, FormsModule, NgIcon, CurrencyThbPipe, TranslatePipe, Skeleton, Spinner],
  templateUrl: './admin-marketing-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    provideIcons({
      phosphorTag,
      phosphorPlusCircle,
      phosphorSparkle,
      phosphorPercent,
      phosphorTrash,
      phosphorCheckCircle,
      phosphorLightning,
      phosphorFolder,
      phosphorClock,
      phosphorWarning,
      phosphorXCircle,
    }),
  ],
})
export class AdminMarketingPage implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly marketingApi = inject(AdminMarketingApiService);

  protected readonly activeTab = signal<'promos' | 'flashSales' | 'bundles'>('promos');

  // Promos State
  protected readonly isLoadingPromos = signal(false);
  protected readonly promos = signal<PromoCodeItem[]>([]);
  protected readonly totalPromos = signal(0);
  protected readonly showPromoModal = signal(false);
  protected readonly promoCode = signal('');
  protected readonly promoDiscountType = signal<PromoCodeDiscountType>('Percentage');
  protected readonly promoDiscountValue = signal(15);
  protected readonly promoMinSpend = signal(0);
  protected readonly promoMaxRedemptions = signal(100);
  protected readonly promoMaxPerUser = signal(1);
  protected readonly promoStartsAt = signal('');
  protected readonly promoEndsAt = signal('');
  protected readonly isSubmittingPromo = signal(false);

  // Flash Sales State
  protected readonly isLoadingFlashSales = signal(false);
  protected readonly flashSales = signal<FlashSaleResponse[]>([]);
  protected readonly totalFlashSales = signal(0);
  protected readonly showFlashSaleModal = signal(false);
  protected readonly flashSaleTitle = signal('');
  protected readonly flashSaleStartsAt = signal('');
  protected readonly flashSaleEndsAt = signal('');
  protected readonly flashSaleCourseId = signal('');
  protected readonly flashSalePrice = signal(499);
  protected readonly isSubmittingFlashSale = signal(false);

  // Bundles State
  protected readonly isLoadingBundles = signal(false);
  protected readonly bundles = signal<BundleResponse[]>([]);
  protected readonly totalBundles = signal(0);
  protected readonly showBundleModal = signal(false);
  protected readonly bundleSlug = signal('');
  protected readonly bundleTitle = signal('');
  protected readonly bundleDescription = signal('');
  protected readonly bundlePrice = signal(1990);
  protected readonly bundleCourseIdsRaw = signal('');
  protected readonly isSubmittingBundle = signal(false);

  // Feedback State
  protected readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: 'การตลาดและโปรโมชัน | SIRI UpSkill Admin',
      description: 'ระบบจัดการโค้ดส่วนลด แฟลชเซล และชุดคอร์สแพ็กเกจ',
      path: '/admin/marketing',
      robots: 'noindex',
    });

    // Default dates
    const now = new Date();
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    this.promoStartsAt.set(now.toISOString().slice(0, 16));
    this.promoEndsAt.set(nextMonth.toISOString().slice(0, 16));
    this.flashSaleStartsAt.set(now.toISOString().slice(0, 16));
    this.flashSaleEndsAt.set(nextMonth.toISOString().slice(0, 16));

    this.loadPromos();
    this.loadFlashSales();
    this.loadBundles();
  }

  protected loadPromos(): void {
    this.isLoadingPromos.set(true);
    this.marketingApi.getPromoCodes(1, 50).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.promos.set([...items]);
        this.totalPromos.set(res?.totalCount ?? items.length);
        this.isLoadingPromos.set(false);
      },
      error: () => {
        this.isLoadingPromos.set(false);
      },
    });
  }

  protected loadFlashSales(): void {
    this.isLoadingFlashSales.set(true);
    this.marketingApi.getFlashSales(1, 50).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.flashSales.set([...items]);
        this.totalFlashSales.set(res?.totalCount ?? items.length);
        this.isLoadingFlashSales.set(false);
      },
      error: () => {
        this.isLoadingFlashSales.set(false);
      },
    });
  }

  protected loadBundles(): void {
    this.isLoadingBundles.set(true);
    this.marketingApi.getBundles(1, 50).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.bundles.set([...items]);
        this.totalBundles.set(res?.totalCount ?? items.length);
        this.isLoadingBundles.set(false);
      },
      error: () => {
        this.isLoadingBundles.set(false);
      },
    });
  }

  // Create Promo Code
  protected openPromoModal(): void {
    this.showPromoModal.set(true);
  }

  protected closePromoModal(): void {
    this.showPromoModal.set(false);
  }

  protected submitCreatePromo(): void {
    const code = this.promoCode().trim().toUpperCase();
    if (!code) {
      this.showMessage('error', 'กรุณาระบุรหัสโค้ดส่วนลด');
      return;
    }

    const starts = this.promoStartsAt() ? new Date(this.promoStartsAt()).toISOString() : new Date().toISOString();
    const ends = this.promoEndsAt() ? new Date(this.promoEndsAt()).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString();

    const request: CreatePromoCodeRequest = {
      code,
      discountType: this.promoDiscountType(),
      discountValue: this.promoDiscountValue(),
      maxRedemptions: this.promoMaxRedemptions(),
      maxPerUser: this.promoMaxPerUser(),
      minOrderAmount: this.promoMinSpend(),
      startsAtUtc: starts,
      endsAtUtc: ends,
      scope: 0,
      scopeRefId: null,
    };

    this.isSubmittingPromo.set(true);
    this.marketingApi.createPromoCode(request).subscribe({
      next: () => {
        this.isSubmittingPromo.set(false);
        this.closePromoModal();
        this.showMessage('success', `สร้างโค้ดส่วนลด "${code}" สำเร็จแล้ว`);
        this.promoCode.set('');
        this.loadPromos();
      },
      error: (err) => {
        this.isSubmittingPromo.set(false);
        const errorDetail = err?.error?.detail || err?.error?.title || 'เกิดข้อผิดพลาดในการสร้างโค้ดส่วนลด';
        this.showMessage('error', errorDetail);
      },
    });
  }

  // Create Flash Sale
  protected openFlashSaleModal(): void {
    this.showFlashSaleModal.set(true);
  }

  protected closeFlashSaleModal(): void {
    this.showFlashSaleModal.set(false);
  }

  protected submitCreateFlashSale(): void {
    const title = this.flashSaleTitle().trim();
    const courseId = this.flashSaleCourseId().trim();
    if (!title || !courseId) {
      this.showMessage('error', 'กรุณากรอกชื่อแคมเปญและ Course ID');
      return;
    }

    const starts = this.flashSaleStartsAt() ? new Date(this.flashSaleStartsAt()).toISOString() : new Date().toISOString();
    const ends = this.flashSaleEndsAt() ? new Date(this.flashSaleEndsAt()).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();

    const request: CreateFlashSaleRequest = {
      title,
      startsAtUtc: starts,
      endsAtUtc: ends,
      items: [
        {
          courseId,
          salePrice: this.flashSalePrice(),
        },
      ],
    };

    this.isSubmittingFlashSale.set(true);
    this.marketingApi.createFlashSale(request).subscribe({
      next: () => {
        this.isSubmittingFlashSale.set(false);
        this.closeFlashSaleModal();
        this.showMessage('success', `สร้าง Flash Sale "${title}" สำเร็จแล้ว`);
        this.flashSaleTitle.set('');
        this.flashSaleCourseId.set('');
        this.loadFlashSales();
      },
      error: (err) => {
        this.isSubmittingFlashSale.set(false);
        const errorDetail = err?.error?.detail || err?.error?.title || 'เกิดข้อผิดพลาดในการสร้าง Flash Sale';
        this.showMessage('error', errorDetail);
      },
    });
  }

  // Create Bundle
  protected openBundleModal(): void {
    this.showBundleModal.set(true);
  }

  protected closeBundleModal(): void {
    this.showBundleModal.set(false);
  }

  protected submitCreateBundle(): void {
    const title = this.bundleTitle().trim();
    let slug = this.bundleSlug().trim();
    if (!slug && title) {
      slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    }

    const rawCourseIds = this.bundleCourseIdsRaw().trim();
    const courseIds = rawCourseIds ? rawCourseIds.split('\n').map((s) => s.trim()).filter((s) => s.length > 0) : [];

    if (!title || !slug || courseIds.length === 0) {
      this.showMessage('error', 'กรุณากรอกชื่อ Slug และระบุ Course ID อย่างน้อย 1 คอร์ส');
      return;
    }

    const request: CreateBundleRequest = {
      slug,
      title,
      description: this.bundleDescription().trim() || null,
      price: this.bundlePrice(),
      courseIds,
    };

    this.isSubmittingBundle.set(true);
    this.marketingApi.createBundle(request).subscribe({
      next: () => {
        this.isSubmittingBundle.set(false);
        this.closeBundleModal();
        this.showMessage('success', `สร้างแพ็กเกจคอร์ส "${title}" สำเร็จแล้ว`);
        this.bundleTitle.set('');
        this.bundleSlug.set('');
        this.bundleDescription.set('');
        this.bundleCourseIdsRaw.set('');
        this.loadBundles();
      },
      error: (err) => {
        this.isSubmittingBundle.set(false);
        const errorDetail = err?.error?.detail || err?.error?.title || 'เกิดข้อผิดพลาดในการสร้าง Bundle';
        this.showMessage('error', errorDetail);
      },
    });
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
