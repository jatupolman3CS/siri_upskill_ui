import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type {
  BookingDisputeState,
  DisputeDetail,
  DisputeMessage,
  OpenDisputeRequest,
  PostDisputeMessageRequest,
} from './tutoring-dispute.models';
import type { Guid } from './tutoring-learner.models';

const bookingPath = (bookingId: Guid): string => `/tutoring/bookings/${encodeURIComponent(bookingId)}/dispute`;
const disputePath = (disputeId: Guid): string => `/tutoring/disputes/${encodeURIComponent(disputeId)}`;

/**
 * The learner's side of a dispute (P13-14): ask whether one can be opened, open it, read the thread, answer and withdraw. The
 * learner sees the cases of their own bookings whoever opened them; an id that is not theirs answers the same `404` as one that
 * does not exist (`tutoring.booking_not_found` / `tutoring.dispute_not_found`). Opening and answering are idempotent through the
 * client-generated `clientRequestId` / `clientMessageId`, so a retry after a lost response never creates a second dispute or message.
 */
@Injectable({ providedIn: 'root' })
export class TutoringDisputeApiService extends ApiService {
  getDisputeState(bookingId: Guid): Observable<BookingDisputeState> {
    return this.get<BookingDisputeState>(bookingPath(bookingId));
  }

  /**
   * 201 (a repeat with the same `clientRequestId` answers 200 with the same case). Freezes the money of the class. `409
   * tutoring.dispute_not_available | dispute_role_not_allowed | dispute_window_closed | dispute_already_open` (+ `disputeId`) `|
   * dispute_already_decided | dispute_reopen_not_allowed | dispute_limit_reached | escrow_unavailable`, `400
   * tutoring.dispute_category_invalid | dispute_text_contains_contact | dispute_evidence_link_invalid | dispute_too_many_links`.
   */
  openDispute(bookingId: Guid, body: OpenDisputeRequest): Observable<DisputeDetail> {
    return this.post<DisputeDetail>(bookingPath(bookingId), body);
  }

  getDispute(disputeId: Guid): Observable<DisputeDetail> {
    return this.get<DisputeDetail>(disputePath(disputeId));
  }

  /** 201. `409 tutoring.dispute_closed | dispute_message_limit`. */
  postMessage(disputeId: Guid, body: PostDisputeMessageRequest): Observable<DisputeMessage> {
    return this.post<DisputeMessage>(`${disputePath(disputeId)}/messages`, body);
  }

  /** Only the opener may withdraw, and not after the other side answered; `409 tutoring.dispute_withdraw_not_allowed | dispute_closed`. */
  withdraw(disputeId: Guid): Observable<DisputeDetail> {
    return this.post<DisputeDetail>(`${disputePath(disputeId)}/withdraw`, {});
  }
}
