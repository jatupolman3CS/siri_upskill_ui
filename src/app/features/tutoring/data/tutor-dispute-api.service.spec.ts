import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TutorDisputeApiService } from './tutor-dispute-api.service';
import { tutoringErrorKey, tutoringProblemOf } from './tutoring-errors';

describe('TutorDisputeApiService', () => {
  let service: TutorDisputeApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutorDisputeApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('asks whether a dispute can be opened for a booking from the tutor side', () => {
    service.getDisputeState('b-1').subscribe();

    const request = httpMock.expectOne('/api/tutoring/tutor/bookings/b-1/dispute');
    expect(request.request.method).toBe('GET');
    request.flush({ bookingId: 'b-1', canOpen: true });
  });

  it('opens a dispute as tutor with the required fields and no forbidden properties', () => {
    const body = {
      category: 'Behavior' as const,
      description: 'Learner was disruptive.',
      evidenceLinks: [{ url: 'https://files.example.test/evidence.png', label: null }],
      clientRequestId: '11111111-1111-4111-8111-111111111111',
    };
    service.openDispute('b-1', body).subscribe();

    const request = httpMock.expectOne('/api/tutoring/tutor/bookings/b-1/dispute');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    for (const forbidden of ['flow', 'priority', 'status', 'userId', 'tutorId', 'amount']) {
      expect(Object.keys(request.request.body as object)).not.toContain(forbidden);
    }
    request.flush({ disputeId: 'd-1' }, { status: 201, statusText: 'Created' });
  });

  it('lists tutor disputes with status and paging query parameters', () => {
    service.listDisputes({ status: 'Open', page: 2, pageSize: 10 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/disputes');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('Open');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 10, totalPages: 0 });
  });

  it('lists tutor disputes with empty query parameters when omitted', () => {
    service.listDisputes().subscribe();

    const req = httpMock.expectOne('/api/tutoring/tutor/disputes');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });

  it('reads, answers and withdraws a dispute on tutor routes', () => {
    service.getDispute('d-1').subscribe();
    const read = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    expect(read.request.method).toBe('GET');
    read.flush({ disputeId: 'd-1' });

    service.postMessage('d-1', { clientMessageId: '22222222-2222-4222-8222-222222222222', body: 'Tutor explanation', evidenceLinks: null }).subscribe();
    const post = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1/messages');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toMatchObject({ body: 'Tutor explanation', evidenceLinks: null });
    post.flush({ messageId: 'msg-1' }, { status: 201, statusText: 'Created' });

    service.withdraw('d-1').subscribe();
    const withdraw = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1/withdraw');
    expect(withdraw.request.method).toBe('POST');
    expect(withdraw.request.body).toEqual({});
    withdraw.flush({ disputeId: 'd-1' });
  });

  it('surfaces an already-open dispute with conflict reason and disputeId', () => {
    let failure: unknown;
    service
      .openDispute('b-1', { category: 'Other', description: 'Testing duplicate.', evidenceLinks: null, clientRequestId: '33333333-3333-4333-8333-333333333333' })
      .subscribe({ error: (error: unknown) => (failure = error) });

    httpMock
      .expectOne('/api/tutoring/tutor/bookings/b-1/dispute')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.dispute_already_open', disputeId: 'd-9' }, { status: 409, statusText: 'Conflict' });

    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.disputeAlreadyOpen');
    expect(tutoringProblemOf(failure)?.disputeId).toBe('d-9');
  });
});
