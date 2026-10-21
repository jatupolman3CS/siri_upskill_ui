import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HTTP_TEST_PROVIDERS } from '../testing/spec-helpers';
import { AdminDisputeApiService } from './admin-dispute-api.service';

describe('AdminDisputeApiService', () => {
  let service: AdminDisputeApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    service = TestBed.inject(AdminDisputeApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the summary tiles', () => {
    service.getSummary().subscribe();
    const req = httpMock.expectOne('/api/tutoring/admin/disputes/summary');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('sends every filter that is set and leaves the rest out (a false flag is not sent)', () => {
    service
      .list({
        status: ['Open', 'UnderReview'],
        category: 'NoClass',
        flow: 'Escrow',
        priority: 'High',
        overdue: true,
        assignedToMe: false,
        needsFollowUp: true,
        tutorId: 't-1',
        q: 'DS-1',
        sort: 'newest',
        page: 3,
        pageSize: 20,
      })
      .subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/disputes');
    const params = req.request.params;
    expect(params.getAll('status')).toEqual(['Open,UnderReview']);
    expect(params.get('category')).toBe('NoClass');
    expect(params.get('flow')).toBe('Escrow');
    expect(params.get('priority')).toBe('High');
    expect(params.get('overdue')).toBe('true');
    expect(params.has('assignedToMe')).toBe(false);
    expect(params.get('needsFollowUp')).toBe('true');
    expect(params.get('tutorId')).toBe('t-1');
    expect(params.get('q')).toBe('DS-1');
    expect(params.get('sort')).toBe('newest');
    expect(params.get('page')).toBe('3');
    req.flush({ items: [], totalCount: 0, page: 3, pageSize: 20, totalPages: 0 });
  });

  it('leaves the server to pick the default status when none is given', () => {
    service.list({ page: 1, pageSize: 20 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/disputes');
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });

  it('reads, claims and decides one dispute on its own routes', () => {
    service.getDispute('d-1').subscribe();
    httpMock.expectOne('/api/tutoring/admin/disputes/d-1').flush({});

    service.claim('d-1', true).subscribe();
    const claim = httpMock.expectOne('/api/tutoring/admin/disputes/d-1/claim');
    expect(claim.request.method).toBe('POST');
    expect(claim.request.body).toEqual({ takeOver: true });
    claim.flush({});

    const decision = {
      decision: 'Resolve' as const,
      resolution: 'PartialRefund' as const,
      refundAmount: 250,
      attendanceOverturned: false,
      compensationRequired: false,
      note: 'Half the class did not happen.',
      suspendTutor: false,
      suspendReason: null,
    };
    service.decide('d-1', decision).subscribe();
    const decide = httpMock.expectOne('/api/tutoring/admin/disputes/d-1/decide');
    expect(decide.request.method).toBe('POST');
    expect(decide.request.body).toEqual(decision);
    decide.flush({});
  });

  it('posts a message with its client id and visibility, and no user id of any kind', () => {
    const message = { clientMessageId: 'cm-1', body: 'Please send the logs.', visibility: 'Parties' as const, evidenceLinks: null };
    service.postMessage('d-1', message).subscribe();
    const req = httpMock.expectOne('/api/tutoring/admin/disputes/d-1/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(message);
    expect(Object.keys(req.request.body as object).some((key) => /user/i.test(key))).toBe(false);
    req.flush({});
  });

  it('closes the compensation follow-up with a note', () => {
    service.markCompensationSettled('d-1', 'Paid by transfer').subscribe();
    const req = httpMock.expectOne('/api/tutoring/admin/disputes/d-1/compensation-settled');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ note: 'Paid by transfer' });
    req.flush({});
  });
});
