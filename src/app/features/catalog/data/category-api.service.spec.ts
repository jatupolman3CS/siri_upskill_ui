import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CategoryTreeNode } from './category-api.models';
import { CategoryApiService } from './category-api.service';

describe('CategoryApiService', () => {
  let service: CategoryApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CategoryApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getCategoryTree requests GET /api/catalog/categories and returns the response as-is', () => {
    const response: readonly CategoryTreeNode[] = [
      {
        id: 'c1',
        slug: 'programming-technology',
        nameTh: 'การเขียนโปรแกรมและเทคโนโลยี',
        nameEn: 'Programming & Technology',
        iconKey: 'code',
        sortOrder: 0,
        isActive: true,
        children: [],
      },
    ];

    let result: readonly CategoryTreeNode[] | undefined;
    service.getCategoryTree().subscribe((value) => (result = value));

    const request = httpMock.expectOne('/api/catalog/categories');
    expect(request.request.method).toBe('GET');
    request.flush(response);

    expect(result).toEqual(response);
  });
});
