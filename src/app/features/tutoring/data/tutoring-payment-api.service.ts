import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { Guid } from './tutoring-learner.models';
import type {
  CreateTutoringPaymentRequest,
  TutoringPayment,
  TutoringPaymentConfig,
  TutoringPaymentMethod,
  TutoringPaymentState,
} from './tutoring-payment.models';

/**
 * Tutoring payment endpoints (P13-06). Tutoring has its own payment API - it does not go through the Commerce order / cart
 * endpoints - and every response here is `Cache-Control: no-store`.
 *
 * The server charges `booking.priceAmount` and nothing the client sends; the final outcome is whatever
 * {@link getPaymentState} reports from the webhook-fed database (never a redirect or a client-side `confirmPayment()`).
 */
@Injectable({ providedIn: 'root' })
export class TutoringPaymentApiService extends ApiService {
  /** Publishable key + the methods currently switched on. `503 payment.provider_not_configured` when there is no key. */
  getPaymentConfig(): Observable<TutoringPaymentConfig> {
    return this.get<TutoringPaymentConfig>('/tutoring/payments/config');
  }

  /**
   * Starts a payment attempt for a held booking, or hands back the still-pending attempt of the same method with a fresh QR /
   * client secret (so it is safe to call again after a reload). Rate limited (10 per minute per user).
   */
  createPayment(bookingId: Guid, method: TutoringPaymentMethod): Observable<TutoringPayment> {
    const body: CreateTutoringPaymentRequest = { method };
    return this.post<TutoringPayment>(`/tutoring/bookings/${encodeURIComponent(bookingId)}/payment`, body);
  }

  /**
   * The same for a package purchase (`POST package-purchases/{id}/payment`, P13-12 section 5.1): the server charges the purchase's
   * `priceSnapshot` and hands back the same pending attempt of the same method on a repeat. The deadline in `holdExpiresAtUtc` is the
   * purchase's `pendingExpiresAtUtc`. `409 tutoring.package_purchase_expired | tutoring.already_paid`, `404 tutoring.package_purchase_not_found`.
   */
  createPackagePayment(purchaseId: Guid, method: TutoringPaymentMethod): Observable<TutoringPayment> {
    const body: CreateTutoringPaymentRequest = { method };
    return this.post<TutoringPayment>(`/tutoring/package-purchases/${encodeURIComponent(purchaseId)}/payment`, body);
  }

  /** The polling target. Own rate limit of 40 per minute per user - callers back off on 429. */
  getPaymentState(paymentId: Guid): Observable<TutoringPaymentState> {
    return this.get<TutoringPaymentState>(`/tutoring/payments/${encodeURIComponent(paymentId)}`);
  }
}
