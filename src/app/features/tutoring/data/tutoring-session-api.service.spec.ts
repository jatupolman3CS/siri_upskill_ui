import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import { tutoringErrorKey, tutoringProblemOf } from './tutoring-errors';
import { TutoringSessionApiService } from './tutoring-session-api.service';

describe('TutoringSessionApiService', () => {
  let service: TutoringSessionApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // withFetch() + the real error interceptor: matches app.config.ts, not the plain XHR default.
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringSessionApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('joins a class with an empty POST to /tutoring/sessions/{id}/join (the role and the rights are the servers)', () => {
    const received = vi.fn();
    service.joinSession('s-1').subscribe(received);

    const request = httpMock.expectOne('/api/tutoring/sessions/s-1/join');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    const answer = { sessionId: 's-1', role: 'Learner', meetUrl: 'https://meet.google.com/abc-defg-hij', startsAtUtc: 'a', endsAtUtc: 'b', serverTimeUtc: 'c' };
    request.flush(answer);

    expect(received).toHaveBeenCalledWith(answer);
  });

  it('surfaces a join window that is not open as an ApiError carrying when it opens and the server clock', () => {
    let failure: unknown;
    service.joinSession('s-1').subscribe({ error: (error: unknown) => (failure = error) });

    httpMock
      .expectOne('/api/tutoring/sessions/s-1/join')
      .flush(
        { title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.window_not_open', opensAtUtc: '2026-10-20T10:45:00Z', serverTimeUtc: '2026-10-20T10:00:00Z' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(failure).toBeInstanceOf(ApiError);
    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.windowNotOpen');
    expect(tutoringProblemOf(failure)).toMatchObject({ opensAtUtc: '2026-10-20T10:45:00Z', serverTimeUtc: '2026-10-20T10:00:00Z' });
  });

  it('attests the tutor is present with an empty POST and accepts the empty 204 answer', () => {
    const done = vi.fn();
    service.markTutorPresent('s-1').subscribe({ complete: done });

    const request = httpMock.expectOne('/api/tutoring/sessions/s-1/tutor-present');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toHaveBeenCalled();
  });

  it('lists the materials and asks for a download address from the session paths', () => {
    service.listMaterials('s-1').subscribe();
    const list = httpMock.expectOne('/api/tutoring/sessions/s-1/materials');
    expect(list.request.method).toBe('GET');
    list.flush([]);

    service.getMaterialDownload('s-1', 'm-1').subscribe();
    const download = httpMock.expectOne('/api/tutoring/sessions/s-1/materials/m-1/download');
    expect(download.request.method).toBe('GET');
    download.flush({ id: 'm-1', fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1, downloadUrl: 'https://files.example.test/signed', expiresAtUtc: 'x' });
  });
});
