import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import { tutoringErrorKey, tutoringProblemOf } from './tutoring-errors';
import { TutoringLearnerApiService } from './tutoring-learner-api.service';
import type { Booking, CreateBookingRequest, LearnerProfile, UpsertLearnerProfileRequest } from './tutoring-learner.models';

const PROFILE: LearnerProfile = {
  learnerProfileId: 'lp-1',
  nickname: 'Mint',
  gradeLevel: 'Secondary4',
  isMinor: true,
  guardianConsentAtUtc: '2026-10-14T03:00:00Z',
  guardianConsentVersion: '2026-10-v1',
  isActive: true,
  anonymizedAtUtc: null,
  guardianConsentWithdrawnAtUtc: null,
};

const UPSERT: UpsertLearnerProfileRequest = {
  nickname: 'Mint',
  gradeLevel: 'Secondary4',
  isMinor: true,
  guardianConsent: true,
  guardianConsentVersion: '2026-10-v1',
};

const BOOKING_REQUEST: CreateBookingRequest = {
  offeringId: 'off-1',
  startsAtUtc: '2026-10-20T11:00:00Z',
  durationMinutes: 60,
  format: 'OneOnOne',
  learnerProfileId: 'lp-1',
  isTrial: false,
};

const BOOKING: Booking = {
  bookingId: 'b-1',
  sessionId: 's-1',
  bookingNo: 'TB-261014-A1B2C3',
  status: 'PendingPayment',
  isTrial: false,
  format: 'OneOnOne',
  priceAmount: 450,
  currency: 'THB',
  startsAtUtc: '2026-10-20T11:00:00Z',
  endsAtUtc: '2026-10-20T12:00:00Z',
  durationMinutes: 60,
  tutor: { slug: 'nina-tutor', displayName: 'Nina Tutor', photoUrl: null },
  offering: { offeringId: 'off-1', subjectNameTh: 'ฟิสิกส์', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
  learner: { learnerProfileId: 'lp-1', nickname: 'Mint', gradeLevel: 'Secondary4' },
  holdExpiresAtUtc: '2026-10-14T03:15:00Z',
  requiresPayment: true,
  paymentId: null,
  refundedAmount: 0,
  confirmedAtUtc: null,
  createdAtUtc: '2026-10-14T03:00:00Z',
  serverTimeUtc: '2026-10-14T03:00:00Z',
  packagePurchaseId: null,
  joinOpensAtUtc: null,
  canJoin: false,
};

describe('TutoringLearnerApiService', () => {
  let service: TutoringLearnerApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // withFetch() + the real error interceptor: matches app.config.ts, not the plain XHR default.
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringLearnerApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the caller learner profiles from GET /tutoring/learner-profiles (one page of up to 50)', () => {
    const received = vi.fn();
    service.listLearnerProfiles().subscribe(received);

    const request = httpMock.expectOne((req) => req.url === '/api/tutoring/learner-profiles');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('50');
    request.flush({ items: [PROFILE], totalCount: 1, page: 1, pageSize: 50, totalPages: 1 });

    expect(received).toHaveBeenCalledWith(expect.objectContaining({ items: [PROFILE] }));
  });

  it('creates a profile with POST and sends only the documented body (no owner id)', () => {
    const received = vi.fn();
    service.createLearnerProfile(UPSERT).subscribe(received);

    const request = httpMock.expectOne('/api/tutoring/learner-profiles');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(UPSERT);
    expect(Object.keys(request.request.body as object)).not.toContain('ownerUserId');
    request.flush(PROFILE, { status: 201, statusText: 'Created' });

    expect(received).toHaveBeenCalledWith(PROFILE);
  });

  it('updates a profile with PUT to its own path', () => {
    service.updateLearnerProfile('lp-1', UPSERT).subscribe();

    const request = httpMock.expectOne('/api/tutoring/learner-profiles/lp-1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(UPSERT);
    request.flush(PROFILE);
  });

  it('deactivates a profile with DELETE and accepts the empty 204 answer', () => {
    const done = vi.fn();
    service.deactivateLearnerProfile('lp-1').subscribe({ complete: done });

    const request = httpMock.expectOne('/api/tutoring/learner-profiles/lp-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toHaveBeenCalled();
  });

  it('withdraws guardian consent with POST /tutoring/learner-profiles/{id}/withdraw-consent and sends confirmation string', () => {
    const received = vi.fn();
    service.withdrawGuardianConsent('lp-1').subscribe(received);

    const request = httpMock.expectOne('/api/tutoring/learner-profiles/lp-1/withdraw-consent');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ confirmation: 'WITHDRAW' });
    const response = { learnerProfileId: 'lp-1', withdrawnAtUtc: '2026-10-19T10:00:00Z' };
    request.flush(response);

    expect(received).toHaveBeenCalledWith(response);
  });

  it('creates a booking with POST /tutoring/bookings and never sends a price, tutor, session or user id', () => {
    const received = vi.fn();
    service.createBooking(BOOKING_REQUEST).subscribe(received);

    const request = httpMock.expectOne('/api/tutoring/bookings');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(BOOKING_REQUEST);
    const keys = Object.keys(request.request.body as object);
    for (const forbidden of ['price', 'priceAmount', 'amount', 'tutorId', 'sessionId', 'userId', 'learnerUserId']) {
      expect(keys).not.toContain(forbidden);
    }
    request.flush(BOOKING, { status: 201, statusText: 'Created' });

    expect(received).toHaveBeenCalledWith(BOOKING);
  });

  it('reads a booking from GET /tutoring/bookings/{id}', () => {
    const received = vi.fn();
    service.getBooking('b-1').subscribe(received);

    httpMock.expectOne('/api/tutoring/bookings/b-1').flush(BOOKING);

    expect(received).toHaveBeenCalledWith(BOOKING);
  });

  it('reads the public cancellation policy', () => {
    const policy = {
      fullRefundHours: 24,
      fullRefundPercent: 100,
      lateRefundPercent: 50,
      tutorCancelRefundPercent: 100,
      tutorNoShowRefundPercent: 100,
      learnerNoShowRefundPercent: 0,
      disputeWindowHours: 24,
    };
    const received = vi.fn();
    service.getCancellationPolicy().subscribe(received);

    httpMock.expectOne('/api/tutoring/cancellation-policy').flush(policy);

    expect(received).toHaveBeenCalledWith(policy);
  });

  it('surfaces a slot conflict as an ApiError whose reason maps to its message and whose extension carries the held booking', () => {
    let failure: unknown;
    service.createBooking(BOOKING_REQUEST).subscribe({ error: (error: unknown) => (failure = error) });

    httpMock
      .expectOne('/api/tutoring/bookings')
      .flush(
        { title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.slot_already_held_by_you', bookingId: 'b-held' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(failure).toBeInstanceOf(ApiError);
    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.slotAlreadyHeldByYou');
    expect(tutoringProblemOf(failure)?.bookingId).toBe('b-held');
  });

  describe('My tutoring (P13-23)', () => {
    it('lists the caller bookings from GET /tutoring/bookings/my with the scope, the page and no status when none is chosen', () => {
      const received = vi.fn();
      service.listMyBookings({ scope: 'past', page: 2, pageSize: 10 }).subscribe(received);

      const request = httpMock.expectOne((req) => req.url === '/api/tutoring/bookings/my');
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('scope')).toBe('past');
      expect(request.request.params.get('page')).toBe('2');
      expect(request.request.params.get('pageSize')).toBe('10');
      expect(request.request.params.has('status')).toBe(false);
      request.flush({ items: [], totalCount: 0, page: 2, pageSize: 10, totalPages: 0 });

      expect(received).toHaveBeenCalledWith(expect.objectContaining({ totalCount: 0 }));
    });

    it('asks the server for the cancellation quote and never binds it', () => {
      const received = vi.fn();
      service.getCancellationQuote('b-1').subscribe(received);

      const request = httpMock.expectOne('/api/tutoring/bookings/b-1/cancellation-quote');
      expect(request.request.method).toBe('GET');
      request.flush({ bookingId: 'b-1', canCancel: true, refundAmount: 225 });

      expect(received).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: 225 }));
    });

    it('cancels with POST and sends only the reason and the refund the learner agreed to (no user, price or session id)', () => {
      service.cancelBooking('b-1', { reason: null, expectedRefundAmount: 225 }).subscribe();

      const request = httpMock.expectOne('/api/tutoring/bookings/b-1/cancel');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ reason: null, expectedRefundAmount: 225 });
      for (const forbidden of ['userId', 'priceAmount', 'sessionId', 'tutorId']) {
        expect(Object.keys(request.request.body as object)).not.toContain(forbidden);
      }
      request.flush({ bookingId: 'b-1', alreadyCancelled: false });
    });

    it('surfaces a changed quote as an ApiError whose extension carries the new amounts', () => {
      let failure: unknown;
      service.cancelBooking('b-1', { reason: null, expectedRefundAmount: 450 }).subscribe({ error: (error: unknown) => (failure = error) });

      httpMock
        .expectOne('/api/tutoring/bookings/b-1/cancel')
        .flush(
          { title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.cancellation_quote_changed', refundAmount: 225, retainedAmount: 225 },
          { status: 409, statusText: 'Conflict' },
        );

      expect(failure).toBeInstanceOf(ApiError);
      expect(tutoringErrorKey(failure)).toBe('tutoring.errors.cancellationQuoteChanged');
      expect(tutoringProblemOf(failure)).toMatchObject({ refundAmount: 225, retainedAmount: 225 });
    });

    it('reads the refunds, confirms completion and reads the lesson summary from the booking paths', () => {
      service.listRefunds('b-1').subscribe();
      const refunds = httpMock.expectOne('/api/tutoring/bookings/b-1/refunds');
      expect(refunds.request.method).toBe('GET');
      refunds.flush([]);

      service.confirmCompleted('b-1').subscribe();
      const confirm = httpMock.expectOne('/api/tutoring/bookings/b-1/confirm-completed');
      expect(confirm.request.method).toBe('POST');
      expect(confirm.request.body).toEqual({});
      confirm.flush({ bookingId: 'b-1', status: 'Completed', confirmedAtUtc: '2026-10-20T12:10:00Z' });

      service.getBookingSummary('b-1').subscribe();
      const summary = httpMock.expectOne('/api/tutoring/bookings/b-1/summary');
      expect(summary.request.method).toBe('GET');
      summary.flush({ bookingId: 'b-1' });
    });

    it('encodes a booking id that is not a plain id instead of letting it change the path', () => {
      service.getCancellationQuote('a/b').subscribe();

      httpMock.expectOne('/api/tutoring/bookings/a%2Fb/cancellation-quote').flush({});
    });
  });
});
