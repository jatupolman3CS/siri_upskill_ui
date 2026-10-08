import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Upload, type UploadOptions } from 'tus-js-client';

import { MediaApiService } from './media-api.service';
import { MediaAssetResponse, MediaUploadSessionResponse } from './media-api.models';

/**
 * The real `Upload` class with `start`/`abort` spied on its prototype — NOT a module-level `vi.mock('tus-js-client')`.
 * The Angular unit-test runner shares one module graph across spec files in a worker (`isolate: false`), so a module
 * mock only applies if THIS file happens to be the first to load `media-api.service`; any other spec that reaches that
 * service first (the live course-builder panel, the recording uploader, the course builder) silently ran the real TUS
 * client here and failed `start`/`abort` roughly two full runs in three. Spying on the shared class works whichever
 * file loaded it first.
 */
const tus = {
  options: undefined as UploadOptions | undefined,
  start: vi.fn(),
  abort: vi.fn(() => Promise.resolve()),
};

const ASSET: MediaAssetResponse = {
  id: 'asset-1', provider: 'BunnyStream', providerAssetId: 'bunny-1', playbackId: null,
  status: 'Processing', durationSeconds: null, drmEnabled: true, thumbnailUrl: null,
  uploadedByUserId: 'user-1', readyAtUtc: null, errorMessage: null, createdAtUtc: '2026-09-09T00:00:00Z',
};

describe('MediaApiService', () => {
  let service: MediaApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    tus.options = undefined;
    vi.clearAllMocks();
    vi.spyOn(Upload.prototype, 'start').mockImplementation(function (this: Upload) {
      tus.options = this.options;
      tus.start();
    });
    vi.spyOn(Upload.prototype, 'abort').mockImplementation(() => tus.abort());
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MediaApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses TUS authorization headers and reports completion only after server acknowledgement', () => {
    const events: { progress: number; isComplete: boolean }[] = [];
    service.uploadVideoFile(
      'https://video.bunnycdn.com/tusupload?AuthorizationSignature=signed-value&AuthorizationExpire=1900000000&LibraryId=123&VideoId=video-1',
      new File(['video'], 'lesson.webm', { type: 'video/webm' }),
    ).subscribe((event) => events.push(event));

    expect(tus.start).toHaveBeenCalledOnce();
    expect(tus.options?.endpoint).toBe('https://video.bunnycdn.com/tusupload');
    expect(tus.options?.headers).toEqual({
      AuthorizationSignature: 'signed-value', AuthorizationExpire: '1900000000', LibraryId: '123', VideoId: 'video-1',
    });
    expect(tus.options?.storeFingerprintForResuming).toBe(false);
    tus.options?.onProgress?.(5, 5);
    expect(events).toEqual([{ progress: 99, isComplete: false }]);
    tus.options?.onSuccess?.({} as never);
    expect(events.at(-1)).toEqual({ progress: 100, isComplete: true });
    httpMock.expectNone((request) => request.url.includes('bunnycdn.com'));
  });

  it('rejects empty files and untrusted upload endpoints before creating an upload', () => {
    const errors: Error[] = [];
    service.uploadVideoFile('https://video.bunnycdn.com/tusupload', new File([], 'empty.mp4', { type: 'video/mp4' }))
      .subscribe({ error: (error: Error) => errors.push(error) });
    service.uploadVideoFile('https://untrusted.example/tusupload', new File(['video'], 'lesson.mp4', { type: 'video/mp4' }))
      .subscribe({ error: (error: Error) => errors.push(error) });
    expect(errors.map((error) => error.message)).toEqual([
      'instructor.builder.upload.emptyFile', 'instructor.builder.upload.invalidSession',
    ]);
    expect(tus.start).not.toHaveBeenCalled();
  });

  it('aborts an in-flight TUS upload when the component unsubscribes', () => {
    const subscription = service.uploadVideoFile(
      'https://video.bunnycdn.com/tusupload?AuthorizationSignature=s&AuthorizationExpire=1900000000&LibraryId=123&VideoId=v',
      new File(['video'], 'lesson.mp4', { type: 'video/mp4' }),
    ).subscribe();
    subscription.unsubscribe();
    expect(tus.abort).toHaveBeenCalledOnce();
  });

  it('polls processing assets and stops after a verified Ready response', async () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const done = vi.fn();
    service.watchAsset('asset-1').subscribe({ next: (asset) => statuses.push(asset.status), complete: done });
    httpMock.expectOne('/api/media/assets/asset-1').flush(ASSET);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    httpMock.expectOne('/api/media/assets/asset-1').flush({ ...ASSET, status: 'Ready', durationSeconds: 12 });
    expect(statuses).toEqual(['Processing', 'Ready']);
    expect(done).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(6000);
    httpMock.expectNone('/api/media/assets/asset-1');
  });

  it('retries completion while Bunny has not acknowledged processing', async () => {
    vi.useFakeTimers();
    const next = vi.fn();
    service.completeUploadSession('session-1').subscribe(next);
    httpMock.expectOne('/api/media/upload-sessions/session-1/complete')
      .flush({}, { status: 409, statusText: 'Conflict' });
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    httpMock.expectOne('/api/media/upload-sessions/session-1/complete').flush({ status: 'Completed' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('createAsset sends POST to /api/media/assets', () => {
    const mockAsset: MediaAssetResponse = {
      id: 'asset-1',
      provider: 'BunnyStream',
      providerAssetId: 'bunny-1',
      playbackId: null,
      status: 'Uploading',
      durationSeconds: null,
      drmEnabled: false,
      thumbnailUrl: null,
      uploadedByUserId: 'user-1',
      readyAtUtc: null,
      errorMessage: null,
      createdAtUtc: '2026-08-25T00:00:00Z',
    };

    let result: MediaAssetResponse | undefined;
    service.createAsset({ title: 'Test Video' }).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/api/media/assets');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Test Video' });
    req.flush(mockAsset);

    expect(result).toEqual(mockAsset);
  });

  it('createUploadSession sends POST to /api/media/assets/{id}/upload-sessions', () => {
    const mockSession: MediaUploadSessionResponse = {
      id: 'session-1',
      mediaAssetId: 'asset-1',
      uploadUrl: 'https://video.bunnycdn.com/tusupload',
      expiresAtUtc: '2026-08-26T00:00:00Z',
      status: 'Active',
      createdAtUtc: '2026-08-25T00:00:00Z',
    };

    let result: MediaUploadSessionResponse | undefined;
    service.createUploadSession('asset-1').subscribe((res) => (result = res));

    const req = httpMock.expectOne('/api/media/assets/asset-1/upload-sessions');
    expect(req.request.method).toBe('POST');
    req.flush(mockSession);

    expect(result).toEqual(mockSession);
  });

  it('completeUploadSession sends POST to /api/media/upload-sessions/{id}/complete', () => {
    const mockSession: MediaUploadSessionResponse = {
      id: 'session-1',
      mediaAssetId: 'asset-1',
      uploadUrl: 'https://video.bunnycdn.com/tusupload',
      expiresAtUtc: '2026-08-26T00:00:00Z',
      status: 'Completed',
      createdAtUtc: '2026-08-25T00:00:00Z',
    };

    let result: MediaUploadSessionResponse | undefined;
    service.completeUploadSession('session-1').subscribe((res) => (result = res));

    const req = httpMock.expectOne('/api/media/upload-sessions/session-1/complete');
    expect(req.request.method).toBe('POST');
    req.flush(mockSession);

    expect(result).toEqual(mockSession);
  });
});
