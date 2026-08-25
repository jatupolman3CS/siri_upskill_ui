import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import {
  CreateOrderCommand,
  CreatePaymentCommand,
  OrderDetailResponse,
  PaymentResponse,
  PromoCodeValidationResponse,
  ValidatePromoCodeCommand,
} from './commerce-api.models';

/**
 * Service for interacting with `/api/commerce/*` endpoints.
 */
@Injectable({ providedIn: 'root' })
export class CommerceApiService extends ApiService {
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

  validatePromoCode(command: ValidatePromoCodeCommand): Observable<PromoCodeValidationResponse> {
    return this.post<PromoCodeValidationResponse>('/commerce/promo-codes/validate', command);
  }
}
