import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { tutoringErrorKey, tutoringProblemOf } from './tutoring-errors';
import { TutoringReviewApiService } from './tutoring-review-api.service';

describe('TutoringReviewApiService', () => {
  let service: TutoringReviewApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringReviewApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the review state of a booking', () => {
    const received = vi.fn();
    service.getReviewState('b-1').subscribe(received);

    const request = httpMock.expectOne('/api/tutoring/bookings/b-1/review');
    expect(request.request.method).toBe('GET');
    request.flush({ bookingId: 'b-1', canReview: true });

    expect(received).toHaveBeenCalledWith(expect.objectContaining({ canReview: true }));
  });

  it('creates a review with POST and only the rating, the comment and the anonymous flag', () => {
    const body = { rating: 5, comment: 'Great', anonymous: true };
    service.createReview('b-1', body).subscribe();

    const request = httpMock.expectOne('/api/tutoring/bookings/b-1/review');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({ reviewId: 'rev-1' }, { status: 201, statusText: 'Created' });
  });

  it('updates a review with PUT to the same path', () => {
    service.updateReview('b-1', { rating: 3, comment: null, anonymous: false }).subscribe();

    const request = httpMock.expectOne('/api/tutoring/bookings/b-1/review');
    expect(request.request.method).toBe('PUT');
    request.flush({ reviewId: 'rev-1' });
  });

  it('surfaces an existing review as a conflict that names it', () => {
    let failure: unknown;
    service.createReview('b-1', { rating: 5, comment: null, anonymous: false }).subscribe({ error: (error: unknown) => (failure = error) });

    httpMock
      .expectOne('/api/tutoring/bookings/b-1/review')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.review_exists', reviewId: 'rev-9' }, { status: 409, statusText: 'Conflict' });

    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.reviewExists');
    expect(tutoringProblemOf(failure)?.reviewId).toBe('rev-9');
  });
});
