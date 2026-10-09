import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PagedResult } from '../../../../core/http/paged-result.model';
import { InstructorApplicationSummary } from './admin-instructor-api.models';
import { AdminInstructorApiService } from './admin-instructor-api.service';

const PAGE: PagedResult<InstructorApplicationSummary> = {
  items: [{ id: 'a1', userId: 'u1', displayName: 'Somchai', headline: null, bio: 'Bio', createdAtUtc: '2026-10-01T03:00:00Z' }],
  totalCount: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

describe('AdminInstructorApiService', () => {
  let service: AdminInstructorApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideHttpClientTesting()] });
    service = TestBed.inject(AdminInstructorApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getPending requests GET /api/catalog/admin/instructors/pending with page and pageSize and returns the envelope', () => {
    let result: PagedResult<InstructorApplicationSummary> | undefined;
    service.getPending(2, 20).subscribe((value) => (result = value));

    const request = httpMock.expectOne((req) => req.url === '/api/catalog/admin/instructors/pending');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('20');
    request.flush(PAGE);

    expect(result).toEqual(PAGE);
  });

  it('approve POSTs to /{id}/approve with no body', () => {
    service.approve('a1').subscribe();

    const request = httpMock.expectOne('/api/catalog/admin/instructors/a1/approve');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ id: 'a1', userId: 'u1', displayName: 'Somchai', status: 'Approved', approvedAtUtc: '2026-10-02T00:00:00Z' });
  });

  it('reject POSTs to /{id}/reject with no body (the endpoint has no reason field)', () => {
    service.reject('a1').subscribe();

    const request = httpMock.expectOne('/api/catalog/admin/instructors/a1/reject');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ id: 'a1', userId: 'u1', displayName: 'Somchai', status: 'Rejected' });
  });

  it('surfaces the 409 for an application that is no longer pending', () => {
    let status: number | undefined;
    service.approve('a1').subscribe({ error: (error: { status: number }) => (status = error.status) });

    httpMock.expectOne('/api/catalog/admin/instructors/a1/approve').flush({ title: 'Conflict' }, { status: 409, statusText: 'Conflict' });

    expect(status).toBe(409);
  });
});
