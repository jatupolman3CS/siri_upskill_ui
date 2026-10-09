import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CategoryTreeNode } from '../../../catalog/data/category-api.models';
import { CategoryResponse } from './admin-category-api.models';
import { AdminCategoryApiService } from './admin-category-api.service';

const NODE: CategoryTreeNode = {
  id: 'c1',
  slug: 'marketing',
  nameTh: 'การตลาด',
  nameEn: 'Marketing',
  iconKey: 'megaphone',
  sortOrder: 0,
  isActive: false,
  children: [],
};

const SAVED: CategoryResponse = {
  id: 'c1',
  slug: 'marketing',
  nameTh: 'การตลาด',
  nameEn: 'Marketing',
  iconKey: null,
  parentId: null,
  sortOrder: 0,
  isActive: true,
};

describe('AdminCategoryApiService', () => {
  let service: AdminCategoryApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideHttpClientTesting()] });
    service = TestBed.inject(AdminCategoryApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getTree requests GET /api/catalog/admin/categories (inactive nodes included) and returns it as-is', () => {
    let result: readonly CategoryTreeNode[] | undefined;
    service.getTree().subscribe((tree) => (result = tree));

    const request = httpMock.expectOne('/api/catalog/admin/categories');
    expect(request.request.method).toBe('GET');
    request.flush([NODE]);

    expect(result).toEqual([NODE]);
  });

  it('create POSTs exactly the CreateCategoryCommand fields (no sortOrder)', () => {
    const body = { slug: 'marketing', nameTh: 'การตลาด', nameEn: 'Marketing', iconKey: null, parentId: null };
    service.create(body).subscribe();

    const request = httpMock.expectOne('/api/catalog/admin/categories');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush(SAVED);
  });

  it('update PUTs the UpdateCategoryCommand (with isActive) to the id route', () => {
    const body = { slug: 'marketing', nameTh: 'การตลาด', nameEn: 'Marketing', iconKey: 'megaphone', parentId: 'p1', isActive: false };
    service.update('c1', body).subscribe();

    const request = httpMock.expectOne('/api/catalog/admin/categories/c1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    request.flush(SAVED);
  });

  it('reorder PUTs the full item list to /reorder, not to an id route', () => {
    const items = [
      { categoryId: 'b', sortOrder: 0 },
      { categoryId: 'a', sortOrder: 1 },
    ];
    service.reorder({ items }).subscribe();

    const request = httpMock.expectOne('/api/catalog/admin/categories/reorder');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ items });
    request.flush(null);
  });

  it('remove sends DELETE and tolerates the 204 empty body', () => {
    let completed = false;
    service.remove('c1').subscribe({ complete: () => (completed = true) });

    const request = httpMock.expectOne('/api/catalog/admin/categories/c1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBe(true);
  });

  it('surfaces the 409 the server returns while a category still has children', () => {
    let status: number | undefined;
    service.remove('c1').subscribe({ error: (error: { status: number }) => (status = error.status) });

    httpMock
      .expectOne('/api/catalog/admin/categories/c1')
      .flush({ title: 'Conflict', status: 409 }, { status: 409, statusText: 'Conflict' });

    expect(status).toBe(409);
  });
});
