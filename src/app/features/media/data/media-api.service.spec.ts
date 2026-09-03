import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MediaApiService } from './media-api.service';
import { MediaAssetResponse, MediaUploadSessionResponse } from './media-api.models';

describe('MediaApiService', () => {
  let service: MediaApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MediaApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

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
