import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import type { PagedResult } from '../../../../core/http/paged-result.model';
import type { AdminReviewListItem } from '../../data/tutoring-review.models';
import { AdminReviewApiService } from './admin-review-api.service';

const item = (overrides: Partial<AdminReviewListItem> = {}): AdminReviewListItem => ({
  reviewId: 'rev-1',
  tutorId: 't-1',
  tutorDisplayName: 'Nina Kru',
  tutorSlug: 'nina-kru',
  bookingId: 'b-1',
  bookingNo: 'BK-001',
  reviewerUserId: 'u-1',
  rating: 5,
  comment: 'Great lesson!',
  reviewerKind: 'Nickname',
  reviewerNickname: 'Mint',
  reviewerGradeBand: null,
  status: 'Published',
  hideReason: null,
  hiddenByUserId: null,
  hiddenAtUtc: null,
  createdAtUtc: '2026-10-15T10:00:00Z',
  editedAtUtc: null,
  countsTowardRating: true,
  redacted: false,
  ...overrides,
});

describe('AdminReviewApiService', () => {
  let service: AdminReviewApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminReviewApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists reviews from GET /tutoring/admin/reviews with query parameters', () => {
    const received = vi.fn();
    service
      .listReviews({
        page: 2,
        pageSize: 15,
        status: 'Published',
        rating: 5,
        tutorId: 't-1',
        search: 'mint',
      })
      .subscribe(received);

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/reviews');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('15');
    expect(req.request.params.get('status')).toBe('Published');
    expect(req.request.params.get('rating')).toBe('5');
    expect(req.request.params.get('tutorId')).toBe('t-1');
    expect(req.request.params.get('search')).toBe('mint');

    const result: PagedResult<AdminReviewListItem> = {
      items: [item()],
      totalCount: 1,
      page: 2,
      pageSize: 15,
      totalPages: 1,
    };
    req.flush(result);
    expect(received).toHaveBeenCalledWith(result);
  });

  it('hides a review with POST /tutoring/admin/reviews/{id}/hide and mandatory reason', () => {
    const received = vi.fn();
    service.hideReview('rev-1', { reason: 'Violates terms' }).subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/admin/reviews/rev-1/hide');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Violates terms' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(received).toHaveBeenCalled();
  });

  it('unhides a review with POST /tutoring/admin/reviews/{id}/unhide', () => {
    const received = vi.fn();
    service.unhideReview('rev-1', { note: 'Restored after review' }).subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/admin/reviews/rev-1/unhide');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ note: 'Restored after review' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(received).toHaveBeenCalled();
  });
});
