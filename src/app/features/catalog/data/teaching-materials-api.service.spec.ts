import { HttpClient, HttpEventType, provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { UPLOAD_HTTP_CLIENT } from '../../../core/http/upload-http-client';
import { TeachingMaterialsApiService } from './teaching-materials-api.service';
import type { TeachingMaterial, TeachingMaterialUploadEvent } from './teaching-materials.models';

const STORED: TeachingMaterial = {
  id: 'a1',
  fileName: 'slides.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  createdAtUtc: '2026-10-10T01:00:00Z',
};

describe('TeachingMaterialsApiService', () => {
  let service: TeachingMaterialsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        // The real token builds an XHR-backed client; here the testing backend must see the upload too.
        { provide: UPLOAD_HTTP_CLIENT, useExisting: HttpClient },
      ],
    });
    service = TestBed.inject(TeachingMaterialsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('episode family', () => {
    it('list -> GET /api/catalog/episodes/{id}/attachments', () => {
      let result: readonly TeachingMaterial[] = [];
      service.list('episode', 'ep-1').subscribe((items) => (result = items));
      const req = httpMock.expectOne('/api/catalog/episodes/ep-1/attachments');
      expect(req.request.method).toBe('GET');
      req.flush([STORED]);
      expect(result).toEqual([STORED]);
    });

    it('getDownload -> GET .../attachments/{attachmentId}/download and returns the signed URL as sent', () => {
      let url = '';
      service.getDownload('episode', 'ep-1', 'a1').subscribe((info) => (url = info.downloadUrl));
      const req = httpMock.expectOne('/api/catalog/episodes/ep-1/attachments/a1/download');
      expect(req.request.method).toBe('GET');
      req.flush({ ...STORED, episodeId: 'ep-1', downloadUrl: 'https://r2.example/key?sig=1', expiresAtUtc: '2026-10-10T01:05:00Z' });
      expect(url).toBe('https://r2.example/key?sig=1');
    });

    it('remove -> DELETE .../attachments/{attachmentId}', () => {
      service.remove('episode', 'ep-1', 'a1').subscribe();
      const req = httpMock.expectOne('/api/catalog/episodes/ep-1/attachments/a1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  describe('live-session family', () => {
    it('uses the /live-sessions/{id}/attachments routes for list, download and delete', () => {
      service.list('session', 's-1').subscribe();
      httpMock.expectOne('/api/catalog/live-sessions/s-1/attachments').flush([]);

      service.getDownload('session', 's-1', 'a1').subscribe();
      httpMock.expectOne('/api/catalog/live-sessions/s-1/attachments/a1/download').flush({});

      service.remove('session', 's-1', 'a1').subscribe();
      const del = httpMock.expectOne('/api/catalog/live-sessions/s-1/attachments/a1');
      expect(del.request.method).toBe('DELETE');
      del.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  it('encodes ids that are placed in the URL', () => {
    service.list('episode', 'a/b c').subscribe();
    httpMock.expectOne('/api/catalog/episodes/a%2Fb%20c/attachments').flush([]);
  });

  describe('upload', () => {
    it.each([
      ['episode', '/api/catalog/episodes/ep-1/attachments'],
      ['session', '/api/catalog/live-sessions/ep-1/attachments'],
    ] as const)('POSTs multipart form data with a single part named "file" (%s)', (kind, url) => {
      const file = new File(['%PDF-1.7'], 'slides.pdf', { type: 'application/pdf' });
      service.upload(kind, 'ep-1', file).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.reportProgress).toBe(true);
      const body = req.request.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(Array.from(body.keys())).toEqual(['file']);
      const part = body.get('file') as File;
      expect(part.name).toBe('slides.pdf');
      // The browser must set the multipart boundary itself.
      expect(req.request.headers.has('Content-Type')).toBe(false);
      req.flush(STORED);
    });

    it('turns upload progress events into percentages and the response into a final "done" event', () => {
      const events: TeachingMaterialUploadEvent[] = [];
      let completed = false;
      service.upload('episode', 'ep-1', new File(['x'], 'a.pdf')).subscribe({ next: (e) => events.push(e), complete: () => (completed = true) });

      const req = httpMock.expectOne('/api/catalog/episodes/ep-1/attachments');
      req.event({ type: HttpEventType.UploadProgress, loaded: 250, total: 1000 });
      req.event({ type: HttpEventType.UploadProgress, loaded: 1000, total: 1000 });
      // Events that are not about the upload are ignored.
      req.event({ type: HttpEventType.DownloadProgress, loaded: 10 });
      req.flush(STORED);

      expect(events).toEqual([
        { type: 'progress', percent: 25 },
        { type: 'progress', percent: 100 },
        { type: 'done', material: STORED },
      ]);
      expect(completed).toBe(true);
    });

    it('reports 0% when the total size is unknown instead of dividing by nothing', () => {
      const events: TeachingMaterialUploadEvent[] = [];
      service.upload('episode', 'ep-1', new File(['x'], 'a.pdf')).subscribe((e) => events.push(e));
      const req = httpMock.expectOne('/api/catalog/episodes/ep-1/attachments');
      req.event({ type: HttpEventType.UploadProgress, loaded: 500 });
      req.flush(STORED);
      expect(events[0]).toEqual({ type: 'progress', percent: 0 });
    });

    it('surfaces a failed upload as an error the UI can map by errorCode', () => {
      let status = 0;
      let code: string | undefined;
      service.upload('session', 's-1', new File(['x'], 'a.pdf')).subscribe({
        error: (e: { status: number; error?: { errorCode?: string } }) => {
          status = e.status;
          code = e.error?.errorCode;
        },
      });
      httpMock
        .expectOne('/api/catalog/live-sessions/s-1/attachments')
        .flush({ title: 'Session cancelled', errorCode: 'conflict' }, { status: 409, statusText: 'Conflict' });
      expect(status).toBe(409);
      expect(code).toBe('conflict');
    });
  });
});
