import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import type { PagedResult } from '../../../core/http/paged-result.model';
import { packageOffer } from '../testing/package-fixtures';
import { TutoringPublicApiService } from './tutoring-public-api.service';
import type {
  IntroVideoPlayback,
  PublicSubjectItem,
  TutorPublicProfile,
  TutorSearchResponse,
  TutorSlotsResponse,
} from './tutoring-public.models';

describe('TutoringPublicApiService', () => {
  let service: TutoringPublicApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // withFetch() + the real error interceptor: matches app.config.ts, not the plain XHR default.
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringPublicApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('searches tutors from GET /tutoring/tutors, sending only the filters that are set', () => {
    const body: TutorSearchResponse = {
      results: { items: [], totalCount: 0, page: 2, pageSize: 12, totalPages: 0 },
      facets: null,
    };
    const received = vi.fn();
    service
      .searchTutors({ q: 'physics', subject: 'physics', level: 'UpperSecondary', priceMax: 600, day: 0, from: '09:00', to: '12:00', page: 2, pageSize: 12, facets: false })
      .subscribe(received);

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutors');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('physics');
    expect(req.request.params.get('level')).toBe('UpperSecondary');
    expect(req.request.params.get('priceMax')).toBe('600');
    // Sunday is index 0 and must survive as "0", not be dropped as falsy.
    expect(req.request.params.get('day')).toBe('0');
    expect(req.request.params.get('facets')).toBe('false');
    expect(req.request.params.has('curriculum')).toBe(false);
    expect(req.request.params.has('priceMin')).toBe(false);
    req.flush(body);
    expect(received).toHaveBeenCalledWith(body);
  });

  it('reads one profile from GET /tutoring/tutors/{slug}, encoding the slug', () => {
    const body = { slug: 'nina-tutor', displayName: 'Nina' } as TutorPublicProfile;
    const received = vi.fn();
    service.getTutorProfile('nina tutor').subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/tutors/nina%20tutor');
    expect(req.request.method).toBe('GET');
    req.flush(body);
    expect(received).toHaveBeenCalledWith(body);
  });

  it('asks for the intro video from the fixed per-slug endpoint (never from a server-supplied path)', () => {
    const body: IntroVideoPlayback = { manifestUrl: 'https://cdn.example.test/v/playlist.m3u8', expiresAtUtc: '2026-10-14T08:05:00Z' };
    const received = vi.fn();
    service.getIntroVideo('nina-tutor').subscribe(received);

    const req = httpMock.expectOne('/api/tutoring/tutors/nina-tutor/intro-video');
    expect(req.request.method).toBe('GET');
    req.flush(body);
    expect(received).toHaveBeenCalledWith(body);
  });

  it('lists the subject taxonomy in one page and only sends parent when given', () => {
    const body: PagedResult<PublicSubjectItem> = { items: [], totalCount: 0, page: 1, pageSize: 200, totalPages: 0 };
    service.listSubjects().subscribe();
    const first = httpMock.expectOne((r) => r.url === '/api/tutoring/subjects');
    expect(first.request.params.get('pageSize')).toBe('200');
    expect(first.request.params.get('page')).toBe('1');
    expect(first.request.params.has('parent')).toBe(false);
    first.flush(body);

    service.listSubjects('math').subscribe();
    const second = httpMock.expectOne((r) => r.url === '/api/tutoring/subjects');
    expect(second.request.params.get('parent')).toBe('math');
    second.flush(body);
  });

  it('reads slots from GET /tutoring/tutors/{slug}/slots and only sends trial when true', () => {
    const body = { tutorSlug: 'nina-tutor', slots: [] } as unknown as TutorSlotsResponse;
    service
      .getTutorSlots('nina-tutor', {
        offeringId: 'off-1',
        from: '2026-10-13T17:00:00Z',
        to: '2026-10-20T17:00:00Z',
        durationMinutes: 60,
        format: 'Group',
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutors/nina-tutor/slots');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('offeringId')).toBe('off-1');
    expect(req.request.params.get('from')).toBe('2026-10-13T17:00:00Z');
    expect(req.request.params.get('durationMinutes')).toBe('60');
    expect(req.request.params.get('format')).toBe('Group');
    expect(req.request.params.has('trial')).toBe(false);
    req.flush(body);
  });

  it('reads the packages of a tutor from GET /tutoring/tutors/{slug}/packages as an array', () => {
    const offer = packageOffer();
    const received = vi.fn();
    service.listTutorPackages('nina-tutor').subscribe(received);
    httpMock.expectOne('/api/tutoring/tutors/nina-tutor/packages').flush([offer]);
    expect(received).toHaveBeenLastCalledWith([offer]);
  });

  it('answers the same 404 for a tutor that is not public when listing packages', () => {
    let failure: unknown;
    service.listTutorPackages('ghost').subscribe({ error: (error: unknown) => (failure = error) });

    httpMock.expectOne('/api/tutoring/tutors/ghost/packages').flush({ title: 'x', errorCode: 'not_found', reason: 'tutoring.tutor_not_found' }, { status: 404, statusText: 'Not Found' });

    expect((failure as ApiError).status).toBe(404);
  });

  it('reads reviews from GET /tutoring/tutors/{slug}/reviews, encoding the slug and passing query params', () => {
    const received = vi.fn();
    service.getTutorReviews('nina tutor', { page: 2, pageSize: 10, sort: 'highest', rating: 5 }).subscribe(received);

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutors/nina%20tutor/reviews');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.get('sort')).toBe('highest');
    expect(req.request.params.get('rating')).toBe('5');

    const response = {
      summary: { ratingAverage: 4.8, ratingCount: 15, distribution: { star1: 0, star2: 0, star3: 1, star4: 2, star5: 12 } },
      reviews: { items: [], totalCount: 15, page: 2, pageSize: 10, totalPages: 2 },
    };
    req.flush(response);
    expect(received).toHaveBeenCalledWith(response);
  });

  it('surfaces the RFC 9457 reason of a failed call on the ApiError', () => {
    const failed = vi.fn();
    service.getTutorProfile('nope').subscribe({ error: failed });

    httpMock
      .expectOne('/api/tutoring/tutors/nope')
      .flush({ title: 'Not Found', errorCode: 'not_found', reason: 'tutoring.tutor_not_found' }, { status: 404, statusText: 'Not Found' });

    expect(failed).toHaveBeenCalledTimes(1);
    const error = failed.mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect((error.details as { reason?: string }).reason).toBe('tutoring.tutor_not_found');
  });
});
