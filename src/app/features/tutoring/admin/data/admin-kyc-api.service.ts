import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import { restoreBlobProblem } from '../../../../core/http/provider-errors';
import type { KycCaseStatus } from '../../data/tutoring-kyc.models';
import type { Guid } from '../../data/tutoring-public.models';
import type { AdminKycCaseDetail, AdminKycCasePage, DecideKycCaseRequest, KycAccessLogPage } from './admin-kyc.models';

const BASE = '/tutoring/admin/kyc';

/**
 * Administrator endpoints of the tutor identity check (P13-02 section 6.2, `AdminOnly`). Every one answers
 * `503 tutoring.kyc.disabled` while the feature is switched off server-side, and every response is `no-store`.
 *
 * Privacy contract of this service: the only way a document's bytes reach the browser is {@link getDocumentContent}, which returns
 * a `Blob` and nothing else - no URL, no name, no cache. The caller owns the blob's lifetime (an object URL it must revoke).
 * There is deliberately no `download` variant: a decrypted identity document must not be written to an administrator's disk.
 */
@Injectable({ providedIn: 'root' })
export class AdminKycApiService extends ApiService {
  /** The review queue, oldest submission first. An empty `statuses` leaves the choice to the server (Submitted + InReview). */
  listCases(statuses: readonly KycCaseStatus[], page: number, pageSize: number): Observable<AdminKycCasePage> {
    return this.get<AdminKycCasePage>(`${BASE}/cases`, {
      status: statuses.length > 0 ? statuses.join(',') : undefined,
      page,
      pageSize,
    });
  }

  getCase(caseId: Guid): Observable<AdminKycCaseDetail> {
    return this.get<AdminKycCaseDetail>(`${BASE}/cases/${encodeURIComponent(caseId)}`);
  }

  /** `Submitted -> InReview`; calling it again is harmless. Decides nothing, so it leaves no audit row. */
  startReview(caseId: Guid): Observable<AdminKycCaseDetail> {
    return this.post<AdminKycCaseDetail>(`${BASE}/cases/${encodeURIComponent(caseId)}/start-review`, {});
  }

  /** Approve / reject / ask for more. The answer is the case as it is now (a stale `rowVersion` answers 409). */
  decide(caseId: Guid, request: DecideKycCaseRequest): Observable<AdminKycCaseDetail> {
    return this.post<AdminKycCaseDetail>(`${BASE}/cases/${encodeURIComponent(caseId)}/decision`, request);
  }

  /** Who opened this document and when, latest first. */
  listAccessLogs(documentId: Guid, page: number, pageSize: number): Observable<KycAccessLogPage> {
    return this.get<KycAccessLogPage>(`${BASE}/documents/${encodeURIComponent(documentId)}/access-logs`, { page, pageSize });
  }

  /**
   * The decrypted file. The server writes an access-log row BEFORE sending the first byte (and refuses with `503
   * tutoring.kyc.log_unavailable` if it cannot), so every successful call here is a recorded "view". Failures keep their
   * `reason`: a JSON problem body arrives as a `Blob` under `responseType: 'blob'`; `restoreBlobProblem` parses it back into the `ApiError`.
   */
  getDocumentContent(documentId: Guid): Observable<Blob> {
    return this.http
      .get(`${this.apiBaseUrl}${BASE}/documents/${encodeURIComponent(documentId)}/content`, { responseType: 'blob' })
      .pipe(restoreBlobProblem());
  }
}
