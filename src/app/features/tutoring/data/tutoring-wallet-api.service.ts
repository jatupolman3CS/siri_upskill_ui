import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { PagedResult, TutorLedgerRow, TutorWalletResponse, TutoringPayoutHistoryItem } from './tutoring-wallet.models';

const BASE = '/tutoring/tutor/wallet';

/**
 * Tutor wallet endpoints of P13-07 (section 8). `InstructorOnly` on the server - deliberately not `TutorOnly`, so a suspended
 * tutor still sees the money that is owed to them. The tutor is the caller; there is no id in any path or query. Every response
 * is `no-store`. Bank-account details are NOT here: they live on the existing instructor payout-account endpoints.
 */
@Injectable({ providedIn: 'root' })
export class TutoringWalletApiService extends ApiService {
  getWallet(): Observable<TutorWalletResponse> {
    return this.get<TutorWalletResponse>(BASE);
  }

  getLedger(page: number, pageSize: number): Observable<PagedResult<TutorLedgerRow>> {
    return this.get<PagedResult<TutorLedgerRow>>(`${BASE}/ledger`, { page, pageSize });
  }

  getPayouts(page: number, pageSize: number): Observable<PagedResult<TutoringPayoutHistoryItem>> {
    return this.get<PagedResult<TutoringPayoutHistoryItem>>(`${BASE}/payouts`, { page, pageSize });
  }
}
