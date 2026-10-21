import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TutoringPackagesApiService } from './tutoring-packages-api.service';
import type { TutorPackage, UpsertPackageRequest } from './tutoring-packages.models';

const PACKAGE: TutorPackage = {
  packageId: 'p-1',
  offering: { offeringId: 'o-1', subjectNameTh: 'ฟิสิกส์', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
  sessionCount: 10,
  durationMinutes: 60,
  discountPercent: 10,
  validDays: 90,
  singleSessionPrice: 450,
  totalPrice: 4050,
  pricePerSession: 405,
  savingsAmount: 450,
  currency: 'THB',
  isActive: true,
  rowVersion: 'AAAAAAAAB9E=',
};
const REQUEST: UpsertPackageRequest = { offeringId: 'o-1', sessionCount: 10, durationMinutes: 60, discountPercent: 10, validDays: 90, isActive: true };

describe('TutoringPackagesApiService', () => {
  let service: TutoringPackagesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()] });
    service = TestBed.inject(TutoringPackagesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists packages from a paged answer', () => {
    const received = vi.fn();
    service.listPackages().subscribe(received);
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/packages');
    expect(req.request.params.get('pageSize')).toBe('50');
    req.flush({ items: [PACKAGE], totalCount: 1, page: 1, pageSize: 50, totalPages: 1 });
    expect(received).toHaveBeenCalledWith([PACKAGE]);
  });

  it('creates with POST and updates with PUT, sending the request as is - never a price', () => {
    service.createPackage(REQUEST).subscribe();
    const create = httpMock.expectOne('/api/tutoring/tutor/packages');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(REQUEST);
    expect(Object.keys(create.request.body as object).some((key) => /price|amount|total/i.test(key))).toBe(false);
    create.flush(PACKAGE);

    service.updatePackage('p/1', { ...REQUEST, discountPercent: 15 }).subscribe();
    const update = httpMock.expectOne('/api/tutoring/tutor/packages/p%2F1');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ ...REQUEST, discountPercent: 15 });
    update.flush(PACKAGE);
  });

  it('deactivates with POST /deactivate', () => {
    service.deactivatePackage('p-1').subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/packages/p-1/deactivate');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
