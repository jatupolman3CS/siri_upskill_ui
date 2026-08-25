import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SearchCoursesResponse } from './course-api.models';
import { CourseApiService } from './course-api.service';

describe('CourseApiService', () => {
  let service: CourseApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('searchCourses sends only the provided filters as query params, omitting undefined ones', () => {
    const response: SearchCoursesResponse = {
      results: { items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 },
      facets: { categories: [], levels: [] },
    };

    let result: SearchCoursesResponse | undefined;
    service.searchCourses({ q: 'python', page: 2, sort: 'Newest' }).subscribe((value) => (result = value));

    const request = httpMock.expectOne(
      (req) => req.url === '/api/catalog/courses/search' && req.method === 'GET',
    );
    expect(request.request.params.get('q')).toBe('python');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('sort')).toBe('Newest');
    expect(request.request.params.has('categoryId')).toBe(false);
    expect(request.request.params.has('minPrice')).toBe(false);

    request.flush(response);
    expect(result).toEqual(response);
  });
});
