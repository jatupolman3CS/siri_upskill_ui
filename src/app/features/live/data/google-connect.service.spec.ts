import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  GOOGLE_AUTH_REDIRECT,
  GoogleConnectService,
  RECORDING_ACCESS_MARKER,
  isGoogleAuthorizationUrl,
} from './google-connect.service';

describe('GoogleConnectService', () => {
  let redirect: ReturnType<typeof vi.fn>;
  let service: GoogleConnectService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    redirect = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: GOOGLE_AUTH_REDIRECT, useValue: redirect },
      ],
    });
    service = TestBed.inject(GoogleConnectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts the return path and redirects to the Google consent URL it gets back', () => {
    const done = vi.fn();
    service.start('/instructor/live-settings').subscribe({ complete: done });

    const req = httpMock.expectOne('/api/live/instructor/google/connect');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ returnPath: '/instructor/live-settings' });
    req.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y' });

    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y');
    expect(done).toHaveBeenCalled();
  });

  it('refuses to navigate to any URL that is not on Google (no open redirect)', () => {
    const error = vi.fn();
    service.start('/instructor/live-settings').subscribe({ error });

    httpMock
      .expectOne('/api/live/instructor/google/connect')
      .flush({ authorizationUrl: 'https://evil.example/o/oauth2/v2/auth' });

    expect(redirect).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('does not redirect when the API answers 503 (feature not configured)', () => {
    const error = vi.fn();
    service.start('/instructor/live-settings').subscribe({ error });

    httpMock
      .expectOne('/api/live/instructor/google/connect')
      .flush({ reason: 'live.google_not_configured' }, { status: 503, statusText: 'Service Unavailable' });

    expect(redirect).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});

describe('GoogleConnectService.startRecordingAccess (P11-13)', () => {
  let redirect: ReturnType<typeof vi.fn>;
  let service: GoogleConnectService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    redirect = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: GOOGLE_AUTH_REDIRECT, useValue: redirect },
      ],
    });
    service = TestBed.inject(GoogleConnectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    sessionStorage.removeItem(RECORDING_ACCESS_MARKER);
    httpMock.verify();
  });

  it('posts to the recording-access route, leaves a one-shot marker, then redirects to Google', () => {
    const done = vi.fn();
    service.startRecordingAccess('/instructor/live-settings').subscribe({ complete: done });

    const req = httpMock.expectOne('/api/live/instructor/google/recording-access/connect');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ returnPath: '/instructor/live-settings' });
    req.flush({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=rec' });

    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=rec');
    expect(done).toHaveBeenCalled();
    expect(service.consumeRecordingAccessPending()).toBe(true);
    expect(service.consumeRecordingAccessPending()).toBe(false);
  });

  it('refuses a non-Google URL: no redirect and no marker', () => {
    const error = vi.fn();
    service.startRecordingAccess('/instructor/live-settings').subscribe({ error });

    httpMock
      .expectOne('/api/live/instructor/google/recording-access/connect')
      .flush({ authorizationUrl: 'https://evil.example/o/oauth2/v2/auth' });

    expect(redirect).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(service.consumeRecordingAccessPending()).toBe(false);
  });

  it('a 409 (feature off / not a Workspace account) redirects nowhere and leaves no marker', () => {
    const error = vi.fn();
    service.startRecordingAccess('/instructor/live-settings').subscribe({ error });

    httpMock
      .expectOne('/api/live/instructor/google/recording-access/connect')
      .flush({ reason: 'live.recording_not_available' }, { status: 409, statusText: 'Conflict' });

    expect(redirect).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(service.consumeRecordingAccessPending()).toBe(false);
  });

  it('does not throw when session storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(service.consumeRecordingAccessPending()).toBe(false);
    } finally {
      getItem.mockRestore();
    }
  });
});

describe('isGoogleAuthorizationUrl', () => {
  it('accepts only https://accounts.google.com URLs', () => {
    expect(isGoogleAuthorizationUrl('https://accounts.google.com/o/oauth2/v2/auth?x=1')).toBe(true);
    expect(isGoogleAuthorizationUrl('http://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(isGoogleAuthorizationUrl('https://accounts.google.com.evil.example/auth')).toBe(false);
    expect(isGoogleAuthorizationUrl('javascript:alert(1)')).toBe(false);
    expect(isGoogleAuthorizationUrl('/relative')).toBe(false);
  });
});
