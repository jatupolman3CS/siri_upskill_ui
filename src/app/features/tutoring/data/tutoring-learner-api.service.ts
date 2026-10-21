import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { PagedResult } from '../../../core/http/paged-result.model';
import type {
  Booking,
  BookingListItem,
  CancellationPolicy,
  CreateBookingRequest,
  GuardianConsentWithdrawalResponse,
  Guid,
  LearnerProfile,
  UpsertLearnerProfileRequest,
  WithdrawGuardianConsentRequest,
} from './tutoring-learner.models';
import type {
  BookingRefundSummary,
  BookingSummaryDto,
  CancelBookingRequest,
  CancelBookingResponse,
  CancellationQuote,
  ConfirmCompletedResponse,
  MyBookingsQuery,
} from './tutoring-my-bookings.models';

/** Learner profiles are capped at ten per account (`Tutoring:LearnerProfiles:MaxActivePerOwner`), so one page is always enough. */
const PROFILES_PAGE_SIZE = 50;

const bookingPath = (bookingId: Guid): string => `/tutoring/bookings/${encodeURIComponent(bookingId)}`;

/**
 * Signed-in learner endpoints of the Tutor Marketplace (P13-05 learner profiles + booking, P13-08 cancellation policy,
 * quote, cancel and refunds, P13-10 confirm-completed and lesson summary).
 * Components never call `HttpClient` directly (frontend.md) - they go through here.
 *
 * Nothing sent from here carries a user id, tutor id, session id or price: the server derives them from the token and from
 * its own data, and answers 404 for any id that is not the caller's (the same answer as for an id that does not exist).
 * Errors surface as `ApiError`; resolve the stable `reason` with `tutoringErrorKey()` (`tutoring-errors.ts`).
 */
@Injectable({ providedIn: 'root' })
export class TutoringLearnerApiService extends ApiService {
  /** Active profiles of the caller, oldest first as the server orders them. */
  listLearnerProfiles(): Observable<PagedResult<LearnerProfile>> {
    return this.get<PagedResult<LearnerProfile>>('/tutoring/learner-profiles', { page: 1, pageSize: PROFILES_PAGE_SIZE });
  }

  /** 201. `400 tutoring.learner_nickname_invalid | tutoring.guardian_consent_required`, `409 tutoring.learner_profile_limit`. */
  createLearnerProfile(body: UpsertLearnerProfileRequest): Observable<LearnerProfile> {
    return this.post<LearnerProfile>('/tutoring/learner-profiles', body);
  }

  updateLearnerProfile(learnerProfileId: Guid, body: UpsertLearnerProfileRequest): Observable<LearnerProfile> {
    return this.put<LearnerProfile>(`/tutoring/learner-profiles/${encodeURIComponent(learnerProfileId)}`, body);
  }

  /** 204. Soft: the profile is switched off, not erased. `409 tutoring.learner_profile_in_use` while it has a live booking. */
  deactivateLearnerProfile(learnerProfileId: Guid): Observable<void> {
    return this.delete<void>(`/tutoring/learner-profiles/${encodeURIComponent(learnerProfileId)}`);
  }

  /**
   * Withdraws guardian consent for a minor profile (P13-17).
   * 200. `409 tutoring.consent_not_applicable` for adults, `409 tutoring.consent_withdraw_blocked` while bookings/packages/disputes are open.
   */
  withdrawGuardianConsent(
    learnerProfileId: Guid,
    body: WithdrawGuardianConsentRequest = { confirmation: 'WITHDRAW' },
  ): Observable<GuardianConsentWithdrawalResponse> {
    return this.post<GuardianConsentWithdrawalResponse>(
      `/tutoring/learner-profiles/${encodeURIComponent(learnerProfileId)}/withdraw-consent`,
      body,
    );
  }

  /**
   * Holds the slot (15 minutes by default) and returns the booking: `PendingPayment` with a `holdExpiresAtUtc`, or already
   * `Confirmed` for a free trial. 201.
   */
  createBooking(body: CreateBookingRequest): Observable<Booking> {
    return this.post<Booking>('/tutoring/bookings', body);
  }

  /** `404 tutoring.booking_not_found` for a booking that does not exist and for one that belongs to somebody else. */
  getBooking(bookingId: Guid): Observable<Booking> {
    return this.get<Booking>(`/tutoring/bookings/${encodeURIComponent(bookingId)}`);
  }

  /** Public. The general rules to show before booking - not the refund of any particular booking. */
  getCancellationPolicy(): Observable<CancellationPolicy> {
    return this.get<CancellationPolicy>('/tutoring/cancellation-policy');
  }

  // --- My tutoring (P13-23) ---------------------------------------------------------------------------------------------

  /** The caller's own bookings, `upcoming` or `past`, a page at a time. Another learner's bookings are never in the answer. */
  listMyBookings(query: MyBookingsQuery): Observable<PagedResult<BookingListItem>> {
    return this.get<PagedResult<BookingListItem>>('/tutoring/bookings/my', {
      scope: query.scope,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** What cancelling would do right now - never binds the server. `200` even when cancelling is impossible (`canCancel = false`). */
  getCancellationQuote(bookingId: Guid): Observable<CancellationQuote> {
    return this.get<CancellationQuote>(`${bookingPath(bookingId)}/cancellation-quote`);
  }

  /**
   * Cancels the caller's booking. Repeating it answers `200` with `alreadyCancelled = true`. `409 tutoring.cancellation_quote_changed`
   * (+ `refundAmount`, `retainedAmount`) means the real refund became lower than `expectedRefundAmount`; `409
   * tutoring.booking_not_cancellable | tutoring.cancel_after_start | tutoring.concurrent_update`.
   */
  cancelBooking(bookingId: Guid, body: CancelBookingRequest): Observable<CancelBookingResponse> {
    return this.post<CancelBookingResponse>(`${bookingPath(bookingId)}/cancel`, body);
  }

  /** The refunds of one booking, newest first (empty when there is none). No provider ids or codes are in the answer. */
  listRefunds(bookingId: Guid): Observable<readonly BookingRefundSummary[]> {
    return this.get<readonly BookingRefundSummary[]>(`${bookingPath(bookingId)}/refunds`);
  }

  /** Early release of the tutor's payment after a finished class. `409 tutoring.confirm_not_available` when it is not (or no longer) possible. */
  confirmCompleted(bookingId: Guid): Observable<ConfirmCompletedResponse> {
    return this.post<ConfirmCompletedResponse>(`${bookingPath(bookingId)}/confirm-completed`, {});
  }

  /** The tutor's lesson summary. `404` until the tutor has written one. */
  getBookingSummary(bookingId: Guid): Observable<BookingSummaryDto> {
    return this.get<BookingSummaryDto>(`${bookingPath(bookingId)}/summary`);
  }
}
