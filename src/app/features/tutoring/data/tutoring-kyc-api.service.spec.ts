import { HttpClient, HttpEventType, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { UPLOAD_HTTP_CLIENT } from '../../../core/http/upload-http-client';
import { TutoringKycApiService, extensionOf } from './tutoring-kyc-api.service';
import type { KycCase, KycDocument, KycUploadEvent } from './tutoring-kyc.models';

const CASE: KycCase = {
  caseId: 'case-1',
  attemptNo: 1,
  status: 'Draft',
  submittedAtUtc: null,
  decidedAtUtc: null,
  decisionNote: null,
  consentVersion: '2026-10-v1',
  documents: [],
};

const DOCUMENT: KycDocument = {
  documentId: 'doc-1',
  type: 'IdCard',
  status: 'Pending',
  uploadedAtUtc: '2026-10-14T05:00:00Z',
  expiresAtUtc: null,
  purged: false,
};

describe('TutoringKycApiService', () => {
  let service: TutoringKycApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        // The real token builds an XHR-backed client; here the testing backend must see the upload too.
        { provide: UPLOAD_HTTP_CLIENT, useExisting: HttpClient },
      ],
    });
    service = TestBed.inject(TutoringKycApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the status from GET /tutoring/tutor/kyc', () => {
    service.getStatus().subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/kyc');
    expect(req.request.method).toBe('GET');
    req.flush({ enabled: true });
  });

  it('opens a case by posting only the consent version (the server stamps the time)', () => {
    service.createCase({ consentVersion: '2026-10-v1' }).subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/kyc/cases');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ consentVersion: '2026-10-v1' });
    req.flush(CASE, { status: 201, statusText: 'Created' });
  });

  it('uploads type, optional expiry and the file; the original file name never leaves the browser', () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'somchai-passport-scan.PDF', { type: 'application/pdf' });
    const events: KycUploadEvent[] = [];
    service.uploadDocument('case-1', 'IdCard', file, '2030-01-31').subscribe((event) => events.push(event));

    const req = httpMock.expectOne('/api/tutoring/tutor/kyc/cases/case-1/documents');
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    const body = req.request.body as FormData;
    expect([...body.keys()].sort()).toEqual(['expiresOn', 'file', 'type']);
    expect(body.get('type')).toBe('IdCard');
    expect(body.get('expiresOn')).toBe('2030-01-31');
    expect((body.get('file') as File).name).toBe('kyc-document.pdf');
    expect((body.get('file') as File).name).not.toContain('somchai');

    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 200 });
    req.flush(DOCUMENT, { status: 201, statusText: 'Created' });

    expect(events).toEqual([
      { type: 'progress', percent: 25 },
      { type: 'done', document: DOCUMENT },
    ]);
  });

  it('omits the expiry when none was given', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    service.uploadDocument('case-1', 'Diploma', file, null).subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/kyc/cases/case-1/documents');
    expect((req.request.body as FormData).has('expiresOn')).toBe(false);
    req.flush(DOCUMENT, { status: 201, statusText: 'Created' });
  });

  it('aborts the request when the subscription is dropped (the page was left mid-upload)', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const subscription = service.uploadDocument('case-1', 'Diploma', file, null).subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/kyc/cases/case-1/documents');
    subscription.unsubscribe();
    expect(req.cancelled).toBe(true);
  });

  it('deletes one document and submits the case', () => {
    service.deleteDocument('case-1', 'doc-1').subscribe();
    const del = httpMock.expectOne('/api/tutoring/tutor/kyc/cases/case-1/documents/doc-1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });

    service.submitCase('case-1').subscribe();
    const submit = httpMock.expectOne('/api/tutoring/tutor/kyc/cases/case-1/submit');
    expect(submit.request.method).toBe('POST');
    submit.flush({ ...CASE, status: 'Submitted' });
  });

  it('exposes no way to read a document back', () => {
    const methods = Object.getOwnPropertyNames(TutoringKycApiService.prototype).filter((name) => name !== 'constructor');
    expect(methods.sort()).toEqual(['createCase', 'deleteDocument', 'getStatus', 'submitCase', 'uploadDocument']);
  });
});

describe('extensionOf', () => {
  it('keeps only a short plain lower-case extension', () => {
    expect(extensionOf('Scan.PDF')).toBe('.pdf');
    expect(extensionOf('photo.final.jpeg')).toBe('.jpeg');
    expect(extensionOf('noextension')).toBe('');
    expect(extensionOf('weird.<script>')).toBe('');
    expect(extensionOf('archive.verylongextension')).toBe('');
  });
});
