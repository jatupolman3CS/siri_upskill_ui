import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import type { Guid } from '../../data/tutoring-public.models';
import type {
  AdminDisputeDetail,
  AdminDisputeListItem,
  AdminDisputeMessage,
  AdminDisputeQuery,
  AdminDisputeSummary,
  AdminPostMessageRequest,
  DecideDisputeRequest,
  PagedResult,
} from './admin-dispute.models';

const BASE = '/tutoring/admin/disputes';

/**
 * Administrator endpoints of tutoring disputes (P13-14 section 5.3, `AdminOnly`). Built against the FROZEN contract - there is no
 * C# for these routes yet. Every response is `no-store`. Whether the case may still be decided, which categories exist and how
 * much can be refunded are the server's answers (`409 dispute_not_decidable`, `409 tutoring.refund_exceeds_cap` + `maxRefundable`);
 * this service computes nothing.
 */
@Injectable({ providedIn: 'root' })
export class AdminDisputeApiService extends ApiService {
  getSummary(): Observable<AdminDisputeSummary> {
    return this.get<AdminDisputeSummary>(`${BASE}/summary`);
  }

  /** `status` is sent comma-separated (an assumption the contract leaves open); left out, the server shows `Open,UnderReview`. */
  list(query: AdminDisputeQuery): Observable<PagedResult<AdminDisputeListItem>> {
    return this.get<PagedResult<AdminDisputeListItem>>(BASE, {
      status: query.status !== undefined && query.status.length > 0 ? query.status.join(',') : undefined,
      category: query.category,
      flow: query.flow,
      priority: query.priority,
      overdue: query.overdue ? true : undefined,
      assignedToMe: query.assignedToMe ? true : undefined,
      needsFollowUp: query.needsFollowUp ? true : undefined,
      tutorId: query.tutorId,
      q: query.q,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  getDispute(disputeId: Guid): Observable<AdminDisputeDetail> {
    return this.get<AdminDisputeDetail>(`${BASE}/${encodeURIComponent(disputeId)}`);
  }

  /** `Open -> UnderReview`. Claiming a case another administrator holds answers 409 unless `takeOver` is true. */
  claim(disputeId: Guid, takeOver: boolean): Observable<AdminDisputeDetail> {
    return this.post<AdminDisputeDetail>(`${BASE}/${encodeURIComponent(disputeId)}/claim`, { takeOver });
  }

  /** `Parties` messages reach the learner and the tutor (and e-mail them); `Internal` ones are for administrators only. */
  postMessage(disputeId: Guid, request: AdminPostMessageRequest): Observable<AdminDisputeMessage> {
    return this.post<AdminDisputeMessage>(`${BASE}/${encodeURIComponent(disputeId)}/messages`, request);
  }

  /** Resolve (full / partial / no refund, or an attendance appeal) or reject. Money moves through Stripe on the server. */
  decide(disputeId: Guid, request: DecideDisputeRequest): Observable<AdminDisputeDetail> {
    return this.post<AdminDisputeDetail>(`${BASE}/${encodeURIComponent(disputeId)}/decide`, request);
  }

  /** The tutor was compensated outside the system: closes the follow-up (the system never pays compensation itself). */
  markCompensationSettled(disputeId: Guid, note: string): Observable<AdminDisputeDetail> {
    return this.post<AdminDisputeDetail>(`${BASE}/${encodeURIComponent(disputeId)}/compensation-settled`, { note });
  }
}
