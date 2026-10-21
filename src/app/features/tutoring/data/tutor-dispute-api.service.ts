import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { PagedResult } from '../../../core/http/paged-result.model';
import type {
  BookingDisputeState,
  DisputeDetail,
  DisputeListItem,
  DisputeMessage,
  OpenDisputeRequest,
  PostDisputeMessageRequest,
  TutorDisputesQuery,
} from './tutoring-dispute.models';
import type { Guid } from './tutoring-learner.models';

const BASE = '/tutoring/tutor';
const bookingPath = (bookingId: Guid): string => `${BASE}/bookings/${encodeURIComponent(bookingId)}/dispute`;
const disputePath = (disputeId: Guid): string => `${BASE}/disputes/${encodeURIComponent(disputeId)}`;

/**
 * The tutor's side of disputes (P13-14 section 5.2): read booking dispute state, open a dispute/appeal,
 * list the tutor's disputes, read a case thread, post messages/evidence, and withdraw.
 *
 * All endpoints require InstructorOnly authorization on the server (a suspended tutor must still be able to
 * answer complaints and follow cases). Every response is `Cache-Control: no-store`. Opening and posting messages
 * are idempotent via clientRequestId / clientMessageId.
 */
@Injectable({ providedIn: 'root' })
export class TutorDisputeApiService extends ApiService {
  getDisputeState(bookingId: Guid): Observable<BookingDisputeState> {
    return this.get<BookingDisputeState>(bookingPath(bookingId));
  }

  /**
   * 201 (or 200 on repeated `clientRequestId`). If opened on a completed class, freezes tutor escrow.
   * `409 dispute_not_available | dispute_role_not_allowed | dispute_window_closed | dispute_already_open | dispute_already_decided | dispute_reopen_not_allowed | dispute_limit_reached | escrow_unavailable`.
   */
  openDispute(bookingId: Guid, body: OpenDisputeRequest): Observable<DisputeDetail> {
    return this.post<DisputeDetail>(bookingPath(bookingId), body);
  }

  /**
   * List disputes for the caller's tutor profile (newest first).
   * If caller has no tutor profile yet, answers an empty paged result (200).
   */
  listDisputes(query: TutorDisputesQuery = {}): Observable<PagedResult<DisputeListItem>> {
    const params: Record<string, string | number> = {};
    if (query.status) {
      params['status'] = query.status;
    }
    if (query.page !== undefined && query.page !== null) {
      params['page'] = query.page;
    }
    if (query.pageSize !== undefined && query.pageSize !== null) {
      params['pageSize'] = query.pageSize;
    }
    return this.get<PagedResult<DisputeListItem>>(`${BASE}/disputes`, params);
  }

  getDispute(disputeId: Guid): Observable<DisputeDetail> {
    return this.get<DisputeDetail>(disputePath(disputeId));
  }

  /**
   * 201 (or 200 on repeated `clientMessageId`).
   * `409 dispute_closed | dispute_message_limit`.
   */
  postMessage(disputeId: Guid, body: PostDisputeMessageRequest): Observable<DisputeMessage> {
    return this.post<DisputeMessage>(`${disputePath(disputeId)}/messages`, body);
  }

  /**
   * Withdraw a dispute opened by the tutor before the counterparty replies.
   * `409 dispute_withdraw_not_allowed | dispute_closed`.
   */
  withdraw(disputeId: Guid): Observable<DisputeDetail> {
    return this.post<DisputeDetail>(`${disputePath(disputeId)}/withdraw`, {});
  }
}
