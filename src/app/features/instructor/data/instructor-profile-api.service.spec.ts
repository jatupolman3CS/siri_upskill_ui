import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { InstructorProfileResponse } from './instructor-profile-api.models';
import { InstructorProfileApiService } from './instructor-profile-api.service';

const PROFILE: InstructorProfileResponse = {
  id: 'p1',
  userId: 'u1',
  displayName: 'Somchai',
  headline: null,
  bio: 'Bio',
  revenueSharePercent: 70,
  status: 'Pending',
  approvedAtUtc: null,
};

describe('InstructorProfileApiService', () => {
  let service: InstructorProfileApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(InstructorProfileApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getMyProfile requests GET /api/catalog/instructors/me and returns the response as-is', () => {
    let result: InstructorProfileResponse | undefined;
    service.getMyProfile().subscribe((value) => (result = value));

    const request = httpMock.expectOne('/api/catalog/instructors/me');
    expect(request.request.method).toBe('GET');
    request.flush(PROFILE);

    expect(result).toEqual(PROFILE);
  });

  it('getMyProfile surfaces the 404 a never-applied user gets', () => {
    let status: number | undefined;
    service.getMyProfile().subscribe({ error: (err: { status: number }) => (status = err.status) });

    httpMock
      .expectOne('/api/catalog/instructors/me')
      .flush({ title: 'Not found' }, { status: 404, statusText: 'Not Found' });

    expect(status).toBe(404);
  });

  it('apply requests POST /api/catalog/instructors/apply with exactly the application fields (no user id)', () => {
    let result: InstructorProfileResponse | undefined;
    service
      .apply({ displayName: 'Somchai', headline: null, bio: 'Bio' })
      .subscribe((value) => (result = value));

    const request = httpMock.expectOne('/api/catalog/instructors/apply');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ displayName: 'Somchai', headline: null, bio: 'Bio' });
    request.flush(PROFILE);

    expect(result).toEqual(PROFILE);
  });
});
