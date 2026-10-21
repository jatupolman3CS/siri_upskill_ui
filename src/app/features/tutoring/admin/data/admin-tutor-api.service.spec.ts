import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HTTP_TEST_PROVIDERS } from '../testing/spec-helpers';
import { AdminTutorApiService } from './admin-tutor-api.service';

describe('AdminTutorApiService', () => {
  let service: AdminTutorApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    service = TestBed.inject(AdminTutorApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists tutors with only the filters that are set', () => {
    service.listTutors({ status: 'Suspended', q: 'som', page: 2, pageSize: 20 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/tutors');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('Suspended');
    expect(req.request.params.get('q')).toBe('som');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 20, totalPages: 0 });

    service.listTutors({ page: 1, pageSize: 20 }).subscribe();
    const bare = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/tutors');
    expect(bare.request.params.has('status')).toBe(false);
    expect(bare.request.params.has('q')).toBe(false);
    bare.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });

  it('reads one tutor', () => {
    service.getTutor('t-1').subscribe();
    const req = httpMock.expectOne('/api/tutoring/admin/tutors/t-1');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('suspends, reinstates and sets the commission on the documented routes and verbs', () => {
    service.suspend('t-1', { reason: 'Repeated no-shows' }).subscribe();
    const suspend = httpMock.expectOne('/api/tutoring/admin/tutors/t-1/suspend');
    expect(suspend.request.method).toBe('POST');
    expect(suspend.request.body).toEqual({ reason: 'Repeated no-shows' });
    suspend.flush({});

    service.reinstate('t-1', { reason: null }).subscribe();
    const reinstate = httpMock.expectOne('/api/tutoring/admin/tutors/t-1/reinstate');
    expect(reinstate.request.method).toBe('POST');
    expect(reinstate.request.body).toEqual({ reason: null });
    reinstate.flush({});

    service.setCommission('t-1', { commissionPercentOverride: 15, reason: 'Founding tutor' }).subscribe();
    const commission = httpMock.expectOne('/api/tutoring/admin/tutors/t-1/commission');
    expect(commission.request.method).toBe('PUT');
    expect(commission.request.body).toEqual({ commissionPercentOverride: 15, reason: 'Founding tutor' });
    commission.flush({});
  });

  it('clears a commission override by sending null', () => {
    service.setCommission('t-1', { commissionPercentOverride: null, reason: 'Back to default' }).subscribe();
    const req = httpMock.expectOne('/api/tutoring/admin/tutors/t-1/commission');
    expect(req.request.body.commissionPercentOverride).toBeNull();
    req.flush({});
  });

  it('lists subjects including inactive ones when asked', () => {
    service.listSubjects(true, 1, 100).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/subjects');
    expect(req.request.params.get('includeInactive')).toBe('true');
    expect(req.request.params.get('pageSize')).toBe('100');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 100, totalPages: 0 });
  });

  it('creates a subject with its slug and updates one without it', () => {
    const create = { slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentId: null, sortOrder: 20 };
    service.createSubject(create).subscribe();
    const created = httpMock.expectOne('/api/tutoring/admin/subjects');
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual(create);
    created.flush({});

    const update = { nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentId: 'g-1', sortOrder: 20, isActive: false };
    service.updateSubject('s-1', update).subscribe();
    const updated = httpMock.expectOne('/api/tutoring/admin/subjects/s-1');
    expect(updated.request.method).toBe('PUT');
    expect(updated.request.body).toEqual(update);
    expect('slug' in (updated.request.body as object)).toBe(false);
    updated.flush({});
  });
});
