import { CommonModule, CurrencyPipe, DatePipe, isPlatformBrowser, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowCounterClockwise,
  phosphorArrowRight,
  phosphorCaretDown,
  phosphorCaretUp,
  phosphorCheck,
  phosphorCheckCircle,
  phosphorClock,
  phosphorCreditCard,
  phosphorFilePdf,
  phosphorInfo,
  phosphorMagnifyingGlass,
  phosphorPlayCircle,
  phosphorPrinter,
  phosphorReceipt,
  phosphorWarning,
  phosphorX,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Modal } from '../../../shared/modal/modal';
import { Pagination } from '../../../shared/pagination/pagination';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import {
  OrderDetailResponse,
  OrderStatus,
  TaxInvoiceResponse,
} from '../data/commerce-api.models';
import { CommerceApiService } from '../data/commerce-api.service';

registerLocaleData(localeTh);

export type OrderTab = 'all' | 'paid' | 'awaiting' | 'refunded';

@Component({
  selector: 'app-order-history-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NgIcon,
    TranslatePipe,
    CurrencyThbPipe,
    Button,
    Modal,
    EmptyState,
    Pagination,
    Skeleton,
  ],
  providers: [
    DatePipe,
    CurrencyPipe,
    provideIcons({
      phosphorReceipt,
      phosphorCheckCircle,
      phosphorClock,
      phosphorXCircle,
      phosphorArrowCounterClockwise,
      phosphorCaretDown,
      phosphorCaretUp,
      phosphorPlayCircle,
      phosphorCreditCard,
      phosphorFilePdf,
      phosphorPrinter,
      phosphorMagnifyingGlass,
      phosphorInfo,
      phosphorX,
      phosphorArrowRight,
      phosphorWarning,
      phosphorCheck,
    }),
  ],
  templateUrl: './order-history-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderHistoryPage implements OnInit {
  private readonly commerceApi = inject(CommerceApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly datePipe = inject(DatePipe);
  protected readonly translation = inject(TranslationService);
  protected readonly router = inject(Router);

  protected readonly orders = signal<readonly OrderDetailResponse[]>([]);
  protected readonly totalCount = signal<number>(0);
  protected readonly page = signal<number>(1);
  protected readonly pageSize = signal<number>(10);
  protected readonly totalPages = signal<number>(1);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly selectedTab = signal<OrderTab>('all');
  protected readonly searchQuery = signal<string>('');
  protected readonly expandedOrderIds = signal<ReadonlySet<string>>(new Set<string>());

  // Receipt Modal State
  protected readonly receiptModalOpen = signal<boolean>(false);
  protected readonly receiptOrder = signal<OrderDetailResponse | null>(null);
  protected readonly receiptInvoice = signal<TaxInvoiceResponse | null>(null);
  protected readonly isInvoiceLoading = signal<boolean>(false);

  // Refund Modal State
  protected readonly refundModalOpen = signal<boolean>(false);
  protected readonly refundOrder = signal<OrderDetailResponse | null>(null);
  protected readonly refundReason = signal<string>('');
  protected readonly refundSubmitting = signal<boolean>(false);
  protected readonly refundSuccess = signal<boolean>(false);
  protected readonly refundError = signal<string | null>(null);

  protected readonly filteredOrders = computed(() => {
    let list = this.orders();
    const tab = this.selectedTab();
    const query = this.searchQuery().trim().toLowerCase();

    if (tab === 'paid') {
      list = list.filter((o) => o.status === 'Paid');
    } else if (tab === 'awaiting') {
      list = list.filter((o) => o.status === 'AwaitingPayment' || o.status === 'Pending');
    } else if (tab === 'refunded') {
      list = list.filter((o) => o.status === 'Refunded' || o.status === 'Cancelled' || o.status === 'Failed');
    }

    if (query) {
      list = list.filter((o) => o.orderNo.toLowerCase().includes(query) || o.items.some((i) => i.titleSnapshot.toLowerCase().includes(query)));
    }

    return list;
  });

  constructor() {
    setPageMeta({
      title: 'orders.pageTitle',
      description: 'orders.pageDescription',
      robots: 'noindex',
    });
  }

  ngOnInit(): void {
    this.loadOrders(1);
  }

  protected loadOrders(page: number): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.page.set(page);

    this.commerceApi.getOrders(page, this.pageSize()).subscribe({
      next: (res) => {
        this.orders.set(res.items);
        this.totalCount.set(res.totalCount);
        this.totalPages.set(res.totalPages || 1);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('common.error');
        this.isLoading.set(false);
      },
    });
  }

  protected onPageChange(newPage: number): void {
    this.loadOrders(newPage);
  }

  protected setTab(tab: OrderTab): void {
    this.selectedTab.set(tab);
  }

  protected toggleExpand(orderId: string): void {
    const current = new Set(this.expandedOrderIds());
    if (current.has(orderId)) {
      current.delete(orderId);
    } else {
      current.add(orderId);
    }
    this.expandedOrderIds.set(current);
  }

  protected isExpanded(orderId: string): boolean {
    return this.expandedOrderIds().has(orderId);
  }

  protected openReceiptModal(order: OrderDetailResponse): void {
    this.receiptOrder.set(order);
    this.receiptInvoice.set(null);
    this.receiptModalOpen.set(true);

    if (order.status === 'Paid') {
      this.isInvoiceLoading.set(true);
      this.commerceApi.getTaxInvoiceByOrderId(order.id).subscribe({
        next: (invoice) => {
          this.receiptInvoice.set(invoice);
          this.isInvoiceLoading.set(false);
        },
        error: () => {
          this.isInvoiceLoading.set(false);
        },
      });
    }
  }

  protected closeReceiptModal(): void {
    this.receiptModalOpen.set(false);
    this.receiptOrder.set(null);
    this.receiptInvoice.set(null);
  }

  protected printReceipt(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.print();
    }
  }

  protected openRefundModal(order: OrderDetailResponse): void {
    this.refundOrder.set(order);
    this.refundReason.set('');
    this.refundSuccess.set(false);
    this.refundError.set(null);
    this.refundModalOpen.set(true);
  }

  protected closeRefundModal(): void {
    this.refundModalOpen.set(false);
    this.refundOrder.set(null);
    this.refundReason.set('');
    this.refundSuccess.set(false);
    this.refundError.set(null);
  }

  protected submitRefund(): void {
    const order = this.refundOrder();
    const reason = this.refundReason().trim();
    if (!order || !reason) return;

    this.refundSubmitting.set(true);
    this.refundError.set(null);

    this.commerceApi.requestRefund({ paymentId: order.id, reason }).subscribe({
      next: () => {
        this.refundSubmitting.set(false);
        this.refundSuccess.set(true);
        this.loadOrders(this.page());
      },
      error: () => {
        this.refundSubmitting.set(false);
        this.refundError.set('orders.refund.errorMessage');
      },
    });
  }

  protected formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    try {
      const locale = this.translation.locale() === 'th' ? 'th-TH' : 'en-US';
      return this.datePipe.transform(dateStr, 'd MMM yyyy, HH:mm', undefined, locale) || dateStr;
    } catch {
      return dateStr;
    }
  }

  protected getStatusBadgeClass(status: OrderStatus): string {
    switch (status) {
      case 'Paid':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
      case 'AwaitingPayment':
      case 'Pending':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
      case 'Refunded':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
      case 'Cancelled':
      case 'Failed':
      default:
        return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/20';
    }
  }

  protected getStatusIcon(status: OrderStatus): string {
    switch (status) {
      case 'Paid':
        return 'phosphorCheckCircle';
      case 'AwaitingPayment':
      case 'Pending':
        return 'phosphorClock';
      case 'Refunded':
        return 'phosphorArrowCounterClockwise';
      case 'Cancelled':
      case 'Failed':
      default:
        return 'phosphorXCircle';
    }
  }
}
