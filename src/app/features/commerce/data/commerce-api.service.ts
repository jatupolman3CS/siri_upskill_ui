import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { PagedResult } from '../../../core/http/paged-result.model';
import {
  BundleResponse,
  CreateOrderCommand,
  CreatePaymentCommand,
  FlashSaleResponse,
  OrderDetailResponse,
  PaymentConfigResponse,
  PaymentResponse,
  PromoCodeValidationResponse,
  RefundResponse,
  RequestRefundCommand,
  TaxInvoiceResponse,
  ValidatePromoCodeCommand,
} from './commerce-api.models';

/**
 * Service for interacting with `/api/commerce/*` endpoints.
 */
@Injectable({ providedIn: 'root' })
export class CommerceApiService extends ApiService {
  getOrders(page = 1, pageSize = 20): Observable<PagedResult<OrderDetailResponse>> {
    return this.get<PagedResult<OrderDetailResponse>>('/commerce/orders', {
      page,
      pageSize,
    });
  }

  getOrder(orderId: string): Observable<OrderDetailResponse> {
    return this.get<OrderDetailResponse>(`/commerce/orders/${encodeURIComponent(orderId)}`);
  }

  createOrder(command: CreateOrderCommand): Observable<OrderDetailResponse> {
    return this.post<OrderDetailResponse>('/commerce/orders', command);
  }

  createPayment(command: CreatePaymentCommand): Observable<PaymentResponse> {
    return this.post<PaymentResponse>('/commerce/payments', command);
  }

  getPayment(paymentId: string): Observable<PaymentResponse> {
    return this.get<PaymentResponse>(`/commerce/payments/${encodeURIComponent(paymentId)}`);
  }

  /** `GET /api/commerce/payments/config` — publishable key + enabled payment methods (`P11-09`). */
  getPaymentConfig(): Observable<PaymentConfigResponse> {
    return this.get<PaymentConfigResponse>('/commerce/payments/config');
  }

  validatePromoCode(command: ValidatePromoCodeCommand): Observable<PromoCodeValidationResponse> {
    return this.post<PromoCodeValidationResponse>('/commerce/promo-codes/validate', command);
  }

  getTaxInvoiceByOrderId(orderId: string): Observable<TaxInvoiceResponse> {
    return this.get<TaxInvoiceResponse>(`/commerce/tax-invoices/by-order/${encodeURIComponent(orderId)}`);
  }

  requestRefund(command: RequestRefundCommand): Observable<RefundResponse> {
    return this.post<RefundResponse>('/commerce/refunds', command);
  }

  getBundlesByCourse(courseId: string): Observable<BundleResponse[]> {
    return this.get<BundleResponse[]>(`/commerce/bundles/by-course/${encodeURIComponent(courseId)}`);
  }

  getFlashSales(page = 1, pageSize = 20): Observable<PagedResult<FlashSaleResponse>> {
    return this.get<PagedResult<FlashSaleResponse>>('/commerce/flash-sales', {
      page,
      pageSize,
    });
  }

  getFlashSale(flashSaleId: string): Observable<FlashSaleResponse> {
    return this.get<FlashSaleResponse>(`/commerce/flash-sales/${encodeURIComponent(flashSaleId)}`);
  }
}

