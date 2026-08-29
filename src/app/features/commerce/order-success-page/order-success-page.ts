import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorCheckCircle,
  phosphorEnvelopeSimple,
  phosphorFilePdf,
  phosphorPlayCircle,
  phosphorReceipt,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../../core/auth/auth.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { CommerceApiService } from '../data/commerce-api.service';

export interface OrderSuccessSummary {
  orderId: string;
  orderNo: string;
  totalAmount: number;
  paymentMethod: string;
  paidAtUtc: string;
  customerEmail: string;
  purchasedCourses: {
    courseId: string;
    title: string;
    slug: string;
    price: number;
    thumbnailUrl: string;
  }[];
}

@Component({
  selector: 'app-order-success-page',
  imports: [CommonModule, RouterLink, NgIcon, CurrencyThbPipe],
  templateUrl: './order-success-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCheckCircle,
      phosphorPlayCircle,
      phosphorReceipt,
      phosphorEnvelopeSimple,
      phosphorFilePdf,
      phosphorArrowRight,
    }),
  ],
})
export class OrderSuccessPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly seoService = inject(SeoService);
  private readonly commerceApi = inject(CommerceApiService);
  private readonly auth = inject(AuthService);

  protected readonly isLoading = signal(false);
  protected readonly order = signal<OrderSuccessSummary | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: 'ชำระเงินสำเร็จ | SIRI UpSkill',
      description: 'ยืนยันคำสั่งซื้อและการลงทะเบียนเรียน',
      path: '/checkout/success',
      robots: 'noindex',
    });

    const email = 'อีเมลของคุณ';
    const orderIdParam = this.route.snapshot.paramMap.get('orderId') || this.route.snapshot.queryParamMap.get('orderId');
    if (orderIdParam) {
      this.isLoading.set(true);
      this.commerceApi.getOrder(orderIdParam).subscribe({
        next: (res) => {
          this.order.set({
            orderId: res.id,
            orderNo: res.orderNo,
            totalAmount: res.totalAmount,
            paymentMethod: 'PromptPay QR (Stripe)',
            paidAtUtc: res.paidAtUtc ?? new Date().toISOString(),
            customerEmail: email,
            purchasedCourses: (res.items || []).map((i) => ({
              courseId: i.courseId ?? i.id,
              title: i.titleSnapshot,
              slug: i.courseId ?? i.id,
              price: i.lineTotal,
              thumbnailUrl: i.thumbnailUrl || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600',
            })),
          });
          this.isLoading.set(false);
        },
        error: () => {
          // Fallback gracefully to preview shape
          this.order.set({
            orderId: orderIdParam,
            orderNo: `ORD-${orderIdParam.slice(0, 8).toUpperCase()}`,
            totalAmount: 0,
            paymentMethod: 'PromptPay QR (Stripe)',
            paidAtUtc: new Date().toISOString(),
            customerEmail: email,
            purchasedCourses: [],
          });
          this.isLoading.set(false);
        },
      });
    }
  }

  protected downloadReceipt(): void {
    const ord = this.order();
    if (!ord) return;
    this.commerceApi.getTaxInvoiceByOrderId(ord.orderId).subscribe({
      next: (inv) => {
        if (inv?.pdfStorageKey) {
          window.open(inv.pdfStorageKey, '_blank');
        } else {
          alert('กำลังจัดเตรียมใบเสร็จรับเงิน ระบบจะส่งให้ทางอีเมล');
        }
      },
      error: () => {
        alert('กำลังจัดเตรียมใบเสร็จรับเงิน ระบบจะส่งให้ทางอีเมล');
      },
    });
  }
}
