import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorCheckCircle,
  phosphorEnvelopeSimple,
  phosphorFilePdf,
  phosphorPlayCircle,
  phosphorReceipt,
} from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { CommerceApiService } from '../data/commerce-api.service';
import { LearningApiService } from '../../learning/data/learning-api.service';

export interface OrderSuccessSummary {
  orderId: string;
  orderNo: string;
  totalAmount: number;
  paymentMethod: string;
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
  imports: [CommonModule, RouterLink, NgIcon, CurrencyThbPipe, TranslatePipe],
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
  private readonly router = inject(Router);
  private readonly learningApi = inject(LearningApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isLoading = signal(false);
  protected readonly order = signal<OrderSuccessSummary | null>(null);
  protected readonly loadError = signal(false);

  ngOnInit(): void {
    this.seoService.set({
      title: 'ชำระเงินสำเร็จ | SIRI UpSkill',
      description: 'ยืนยันคำสั่งซื้อและการลงทะเบียนเรียน',
      path: '/checkout/success',
      robots: 'noindex',
    });

    const orderIdParam = this.route.snapshot.paramMap.get('orderId') || this.route.snapshot.queryParamMap.get('orderId');
    if (orderIdParam) {
      this.isLoading.set(true);
      this.commerceApi.getOrder(orderIdParam).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (res) => {
          if (res.status !== 'Paid') {
            this.isLoading.set(false);
            this.router.navigate(['/checkout', res.id], { replaceUrl: true });
            return;
          }
          this.order.set({
            orderId: res.id,
            orderNo: res.orderNo,
            totalAmount: res.totalAmount,
            paymentMethod: res.totalAmount === 0 ? 'checkout.methods.free' : 'checkout.methods.promptpay',
            purchasedCourses: (res.items || []).map((i) => ({
              courseId: i.courseId ?? '',
              title: i.titleSnapshot,
              slug: '',
              price: i.lineTotal,
              thumbnailUrl: i.thumbnailUrl || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600',
            })),
          });
          this.isLoading.set(false);
          this.learningApi.getAllMyEnrollments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (enrollments) => this.order.update((order) => order && ({
              ...order,
              purchasedCourses: order.purchasedCourses.map((course) => ({
                ...course,
                slug: enrollments.find((enrollment) => enrollment.courseId === course.courseId)?.courseSlug ?? '',
              })),
            })),
            error: () => undefined,
          });
        },
        error: () => {
          this.loadError.set(true);
          this.isLoading.set(false);
        },
      });
    } else {
      this.loadError.set(true);
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
          alert('ยังไม่มีใบเสร็จรับเงินสำหรับคำสั่งซื้อนี้');
        }
      },
      error: () => {
        alert('ไม่สามารถดาวน์โหลดใบเสร็จรับเงินได้ กรุณาลองใหม่ภายหลัง');
      },
    });
  }
}
