import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveInstructorApiService } from './live-instructor-api.service';

describe('LiveInstructorApiService', () => {
  let service: LiveInstructorApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(LiveInstructorApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getGoogleStatus -> GET /api/live/instructor/google/status', () => {
    service.getGoogleStatus().subscribe();
    const req = httpMock.expectOne('/api/live/instructor/google/status');
    expect(req.request.method).toBe('GET');
    req.flush({ configured: true, connected: false });
  });

  it('connectGoogle posts the returnPath only when given', () => {
    service.connectGoogle('/instructor/live-settings').subscribe();
    const first = httpMock.expectOne('/api/live/instructor/google/connect');
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({ returnPath: '/instructor/live-settings' });
    first.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });

    service.connectGoogle().subscribe();
    const second = httpMock.expectOne('/api/live/instructor/google/connect');
    expect(second.request.body).toEqual({});
    second.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
  });

  it('disconnectGoogle -> DELETE /api/live/instructor/google', () => {
    service.disconnectGoogle().subscribe();
    const req = httpMock.expectOne('/api/live/instructor/google');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('getCourseMeetings / setMeetingLink / resyncMeeting use the documented paths and bodies', () => {
    service.getCourseMeetings('c1').subscribe();
    httpMock.expectOne('/api/live/instructor/courses/c1/meetings').flush({ items: [] });

    service.setMeetingLink('s1', 'https://meet.google.com/abc-defg-hij').subscribe();
    const put = httpMock.expectOne('/api/live/instructor/sessions/s1/meeting-link');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ meetUrl: 'https://meet.google.com/abc-defg-hij' });
    put.flush({});

    service.resyncMeeting('s1').subscribe();
    const post = httpMock.expectOne('/api/live/instructor/sessions/s1/meeting/resync');
    expect(post.request.method).toBe('POST');
    post.flush({});
  });

  it('listSessions sends scope/page/pageSize and omits an unset courseId', () => {
    service.listSessions({ scope: 'upcoming' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions');
    expect(req.request.params.get('scope')).toBe('upcoming');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.has('courseId')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });

  it('getRoster sends filter and paging', () => {
    service.getRoster('s1', { filter: 'notJoined', page: 2 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/live/instructor/sessions/s1/roster');
    expect(req.request.params.get('filter')).toBe('notJoined');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('50');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 50, totalPages: 0 });
  });

  it('catalog schedule writes hit the Catalog routes with the documented bodies', () => {
    service.getLiveSchedule('c1').subscribe();
    httpMock.expectOne('/api/catalog/instructor/courses/c1/live-schedule').flush({});

    service
      .createSession('c1', { title: 'T', startsAtUtc: '2026-10-08T03:00:00Z', endsAtUtc: '2026-10-08T05:00:00Z' })
      .subscribe();
    const create = httpMock.expectOne('/api/catalog/instructor/courses/c1/live-sessions');
    expect(create.request.method).toBe('POST');
    expect(create.request.body.startsAtUtc).toBe('2026-10-08T03:00:00Z');
    create.flush({});

    service.cancelSession('c1', 's1', 'sick').subscribe();
    const cancel = httpMock.expectOne('/api/catalog/instructor/courses/c1/live-sessions/s1/cancel');
    expect(cancel.request.body).toEqual({ reason: 'sick' });
    cancel.flush({});

    service.setDeliveryFormat('c1', 'Hybrid').subscribe();
    const format = httpMock.expectOne('/api/catalog/instructor/courses/c1/delivery-format');
    expect(format.request.method).toBe('PUT');
    expect(format.request.body).toEqual({ deliveryFormat: 'Hybrid' });
    format.flush({});

    service.setEnrollmentPolicy('c1', { enrollmentDeadlineUtc: null, maxSeats: 30 }).subscribe();
    const policy = httpMock.expectOne('/api/catalog/instructor/courses/c1/enrollment-policy');
    expect(policy.request.body).toEqual({ enrollmentDeadlineUtc: null, maxSeats: 30 });
    policy.flush({});

    service.setLiveSettings('c1', true).subscribe();
    const settings = httpMock.expectOne('/api/catalog/instructor/courses/c1/live-settings');
    expect(settings.request.body).toEqual({ googleAttendeeSyncEnabled: true });
    settings.flush({});

    service.attachRecording('c1', 's1', { mediaAssetId: 'm1' }).subscribe();
    const recording = httpMock.expectOne('/api/catalog/instructor/courses/c1/live-sessions/s1/recording');
    expect(recording.request.method).toBe('POST');
    expect(recording.request.body).toEqual({ mediaAssetId: 'm1' });
    recording.flush({});
  });

  describe('recording import (P11-13)', () => {
    it('getGoogleStatus returns the account kind, hosted domain and recording capability exactly as sent', () => {
      const received = vi.fn();
      service.getGoogleStatus().subscribe(received);
      const body = {
        configured: true,
        connected: true,
        needsReconnect: false,
        googleEmail: 'teacher@example.com',
        connectedAtUtc: null,
        lastValidatedAtUtc: null,
        revokedReason: null,
        affectedSessionCount: 0,
        accountKind: 'Workspace',
        hostedDomain: 'example.com',
        recording: { mode: 'AutoNeedsConsent', autoImportAvailable: true, scopesGranted: false },
      };
      httpMock.expectOne('/api/live/instructor/google/status').flush(body);
      expect(received).toHaveBeenCalledWith(body);
    });

    it('connectRecordingAccess posts the return path to the recording-access route', () => {
      const received = vi.fn();
      service.connectRecordingAccess('/instructor/live-settings').subscribe(received);
      const req = httpMock.expectOne('/api/live/instructor/google/recording-access/connect');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ returnPath: '/instructor/live-settings' });
      req.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
      expect(received).toHaveBeenCalledWith({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    });

    it('retryRecordingImport posts to the session retry route (id URL-encoded) and returns the refreshed import state', () => {
      const received = vi.fn();
      service.retryRecordingImport('s 1').subscribe(received);
      const req = httpMock.expectOne('/api/live/instructor/sessions/s%201/recording-import/retry');
      expect(req.request.method).toBe('POST');
      const info = { mode: 'Auto', status: 'Waiting', errorCode: null, nextAttemptAtUtc: '2026-10-10T03:00:00Z', canRetry: false };
      req.flush(info);
      expect(received).toHaveBeenCalledWith(info);
    });

    it('listSessions / getSessionDetail pass the recordingImport object through untouched', () => {
      const info = { mode: 'Auto', status: 'NoRecording', errorCode: null, nextAttemptAtUtc: null, canRetry: true };
      const list = vi.fn();
      service.listSessions({ scope: 'past' }).subscribe(list);
      httpMock
        .expectOne((r) => r.url === '/api/live/instructor/sessions')
        .flush({ items: [{ sessionId: 's1', recordingImport: info }], totalCount: 1, page: 1, pageSize: 20, totalPages: 1 });
      expect(list.mock.calls[0][0].items[0].recordingImport).toEqual(info);

      const detail = vi.fn();
      service.getSessionDetail('s1').subscribe(detail);
      httpMock.expectOne('/api/live/instructor/sessions/s1').flush({ sessionId: 's1', recordingImport: info });
      expect(detail.mock.calls[0][0].recordingImport).toEqual(info);
    });
  });
});
