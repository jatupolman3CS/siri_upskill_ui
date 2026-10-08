import { CommonModule, DOCUMENT } from '@angular/common';
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

import { notConfiguredMessageKey } from '../../../core/http/provider-errors';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { saveBlob } from '../../live/learner/save-blob';
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
    thumbnailUrl: string | null;
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
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);

  protected readonly isLoading = signal(false);
  protected readonly isDownloadingReceipt = signal(false);
  protected readonly order = signal<OrderSuccessSummary | null>(null);
  protected readonly loadError = signal(false);

  ngOnInit(): void {
    this.seoService.set({
      title: this.translation.t('checkout.successPageTitle'),
      description: this.translation.t('checkout.successPageDescription'),
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
              thumbnailUrl: i.thumbnailUrl || null,
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

  /**
   * Downloads the server-rendered receipt PDF (`GET /api/commerce/orders/{id}/receipt`). A failure — including the
   * server's "receipt seller details are not configured" 503 — is explained in plain words; pressing the button again
   * is the retry.
   */
  protected downloadReceipt(): void {
    const ord = this.order();
    if (!ord || this.isDownloadingReceipt()) return;
    this.isDownloadingReceipt.set(true);
    this.commerceApi.downloadOrderReceiptPdf(ord.orderId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (blob) => {
        saveBlob(this.document, blob, `receipt-${ord.orderNo}.pdf`);
        this.isDownloadingReceipt.set(false);
      },
      error: (error: unknown) => {
        this.isDownloadingReceipt.set(false);
        this.toast.error(this.translation.t(notConfiguredMessageKey(error) ?? 'orders.receipt.downloadFailed'));
      },
    });
  }
}
