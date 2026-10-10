import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import { PagedResult } from '../../../../core/http/paged-result.model';
import {
  PaymentAmountOverrideEntry,
  PaymentAmountOverrideState,
  UpdatePaymentAmountOverrideRequest,
} from './payment-amount-override.models';

const BASE_PATH = '/commerce/admin/payment-amount-override';

/**
 * `*ApiService` for the AdminOnly payment-amount-override endpoints. Components never call `HttpClient` directly
 * (frontend.md). The switch affects real money, so nothing here caches: every read goes to the server.
 */
@Injectable({ providedIn: 'root' })
export class PaymentAmountOverrideApiService extends ApiService {
  /** The current setting. */
  getState(): Observable<PaymentAmountOverrideState> {
    return this.get<PaymentAmountOverrideState>(BASE_PATH);
  }

  /** Switches the override on/off (or changes its amount) and answers with the NEW state. 400 carries field errors. */
  update(request: UpdatePaymentAmountOverrideRequest): Observable<PaymentAmountOverrideState> {
    return this.put<PaymentAmountOverrideState>(BASE_PATH, request);
  }

  /** The audit log, newest first. */
  getHistory(page: number, pageSize: number): Observable<PagedResult<PaymentAmountOverrideEntry>> {
    return this.get<PagedResult<PaymentAmountOverrideEntry>>(`${BASE_PATH}/history`, { page, pageSize });
  }
}
