import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ApiError } from '../../../../core/http/error.interceptor';
import { HTTP_TEST_PROVIDERS, problemBody } from '../testing/spec-helpers';
import { tutoringReasonOf } from '../../data/tutoring-errors';
import { AdminKycApiService } from './admin-kyc-api.service';

describe('AdminKycApiService', () => {
  let service: AdminKycApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    service = TestBed.inject(AdminKycApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the queue with the statuses as ONE comma-separated value', () => {
    service.listCases(['Submitted', 'InReview'], 2, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/kyc/cases');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.getAll('status')).toEqual(['Submitted,InReview']);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 20, totalPages: 0 });
  });

  it('leaves the status out when none is chosen (the server then shows Submitted and InReview)', () => {
    service.listCases([], 1, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/kyc/cases');
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });

  it('reads a case and starts a review on the case routes', () => {
    service.getCase('c 1').subscribe();
    const get = httpMock.expectOne('/api/tutoring/admin/kyc/cases/c%201');
    expect(get.request.method).toBe('GET');
    get.flush({});

    service.startReview('c-1').subscribe();
    const post = httpMock.expectOne('/api/tutoring/admin/kyc/cases/c-1/start-review');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({});
    post.flush({});
  });

  it('posts the decision with the row version and the verdicts it was given', () => {
    const request = {
      decision: 'Approve' as const,
      note: null,
      documents: [{ documentId: 'doc-1', status: 'Approved' as const }],
      rowVersion: 'AAAA',
    };
    service.decide('c-1', request).subscribe();
    const req = httpMock.expectOne('/api/tutoring/admin/kyc/cases/c-1/decision');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({});
  });

  it('pages the access log of one document', () => {
    service.listAccessLogs('doc-1', 3, 10).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/admin/kyc/documents/doc-1/access-logs');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [], totalCount: 0, page: 3, pageSize: 10, totalPages: 0 });
  });

  it('fetches a document as a blob, with no download flag and nothing in the URL but the id', () => {
    let received: Blob | undefined;
    service.getDocumentContent('doc-1').subscribe((blob) => (received = blob));
    const req = httpMock.expectOne('/api/tutoring/admin/kyc/documents/doc-1/content');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(new Blob(['x'], { type: 'application/pdf' }));
    expect(received?.type).toBe('application/pdf');
  });

  it('keeps the reason of a failed document fetch (the JSON problem arrives as a blob and is parsed back)', async () => {
    let failure: unknown;
    service.getDocumentContent('doc-1').subscribe({ error: (error: unknown) => (failure = error) });
    const body = problemBody(410, 'tutoring.kyc.document_purged', 'gone');
    httpMock
      .expectOne('/api/tutoring/admin/kyc/documents/doc-1/content')
      .flush(new Blob([JSON.stringify(body)], { type: 'application/problem+json' }), { status: 410, statusText: 'Gone' });
    await vi.waitFor(() => expect(failure).toBeInstanceOf(ApiError));
    expect((failure as ApiError).status).toBe(410);
    expect(tutoringReasonOf(failure)).toBe('tutoring.kyc.document_purged');
  });
});
