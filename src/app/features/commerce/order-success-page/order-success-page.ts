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

import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { SeoService } from '../../../core/seo/seo.service';

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

  protected readonly order = signal<OrderSuccessSummary>({
    orderId: 'ord-001',
    orderNo: 'ORD-202608-8849',
    totalAmount: 2590,
    paymentMethod: 'PromptPay QR (Stripe)',
    paidAtUtc: new Date().toISOString(),
    customerEmail: 'learner@siriupskill.com',
    purchasedCourses: [
      {
        courseId: 'c-1',
        title: 'Full-Stack Web Development with Angular & .NET 10',
        slug: 'full-stack-web-angular-dotnet-10',
        price: 2590,
        thumbnailUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600',
      },
    ],
  });

  ngOnInit(): void {
    this.seoService.set({
      title: 'ชำระเงินสำเร็จ | SIRI UpSkill',
      description: 'ยืนยันคำสั่งซื้อและการลงทะเบียนเรียน',
      path: '/checkout/success',
      robots: 'noindex',
    });

    const orderIdParam = this.route.snapshot.paramMap.get('orderId');
    if (orderIdParam) {
      this.order.update((o) => ({
        ...o,
        orderId: orderIdParam,
        orderNo: `ORD-202608-${orderIdParam.slice(-4).toUpperCase()}`,
      }));
    }
  }
}
