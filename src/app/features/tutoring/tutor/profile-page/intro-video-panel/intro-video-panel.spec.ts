import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import type { Mock } from 'vitest';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { MediaAssetResponse } from '../../../../media/data/media-api.models';
import { MediaApiService } from '../../../../media/data/media-api.service';
import { IntroVideoPanel } from './intro-video-panel';

const LINK_URL = '/api/tutoring/tutor/profile/intro-video';

function asset(status: MediaAssetResponse['status']): MediaAssetResponse {
  return {
    id: 'asset-1',
    provider: 'bunny',
    providerAssetId: 'p1',
    playbackId: null,
    status,
    durationSeconds: 90,
    drmEnabled: false,
    thumbnailUrl: null,
    uploadedByUserId: 'u1',
    readyAtUtc: null,
    errorMessage: null,
    createdAtUtc: '2026-10-14T05:00:00Z',
  };
}

describe('IntroVideoPanel', () => {
  let fixture: ComponentFixture<IntroVideoPanel>;
  let httpMock: HttpTestingController;
  let media: {
    validateVideoFile: ReturnType<typeof vi.fn>;
    createAsset: ReturnType<typeof vi.fn>;
    createUploadSession: ReturnType<typeof vi.fn>;
    uploadVideoFile: ReturnType<typeof vi.fn>;
    completeUploadSession: ReturnType<typeof vi.fn>;
    watchAsset: ReturnType<typeof vi.fn>;
  };
  let changed: Mock<() => void>;

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  function pick(file: File): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: { item: () => file, length: 1 } });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    media = {
      validateVideoFile: vi.fn(() => null),
      createAsset: vi.fn(() => of(asset('Uploading'))),
      createUploadSession: vi.fn(() => of({ id: 'session-1', mediaAssetId: 'asset-1', uploadUrl: 'https://video.bunnycdn.com/tusupload?x=1', expiresAtUtc: '', status: 'Open', createdAtUtc: '' })),
      uploadVideoFile: vi.fn(() => of({ progress: 50, isComplete: false }, { progress: 100, isComplete: true })),
      completeUploadSession: vi.fn(() => of({ id: 'session-1', mediaAssetId: 'asset-1', uploadUrl: '', expiresAtUtc: '', status: 'Completed', createdAtUtc: '' })),
      watchAsset: vi.fn(() => of(asset('Processing'), asset('Ready'))),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MediaApiService, useValue: media },
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IntroVideoPanel);
    changed = vi.fn<() => void>();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('uploads through the media pipeline, waits for Ready, then links the asset to the profile', () => {
    pick(new File(['video'], 'intro.mp4', { type: 'video/mp4' }));

    expect(media.createAsset).toHaveBeenCalledTimes(1);
    expect(media.createUploadSession).toHaveBeenCalledWith('asset-1');
    expect(media.completeUploadSession).toHaveBeenCalledWith('session-1');
    expect(media.watchAsset).toHaveBeenCalledWith('asset-1');

    const req = httpMock.expectOne(LINK_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mediaAssetId: 'asset-1' });
    req.flush({});
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain('Updating your profile');
  });

  it('stops before uploading when the file is not a video', () => {
    media.validateVideoFile.mockReturnValue('instructor.builder.upload.invalidType');
    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(media.createAsset).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-tutor-problem').textContent).not.toBe('');
  });

  it('reports a video that never became playable without linking it', () => {
    media.watchAsset.mockReturnValue(of(asset('Failed')));
    pick(new File(['video'], 'intro.mp4', { type: 'video/mp4' }));
    httpMock.expectNone(LINK_URL);
    expect(changed).not.toHaveBeenCalled();
  });

  it('retries only the link - not the upload - after the server refuses the first attempt', () => {
    pick(new File(['video'], 'intro.mp4', { type: 'video/mp4' }));
    httpMock.expectOne(LINK_URL).flush({ reason: 'tutoring.intro_video_duration_invalid' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-tutor-problem').textContent).toContain('between 5 seconds and 3 minutes');

    const retry = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Try linking again'))!;
    retry.click();
    httpMock.expectOne(LINK_URL).flush({});
    expect(media.createAsset).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('removes a linked video', () => {
    fixture.componentRef.setInput('hasVideo', true);
    fixture.detectChanges();
    expect(text()).toContain('An intro video is linked');
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Remove intro video'))!.click();
    const req = httpMock.expectOne(LINK_URL);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('is inert while the profile is read-only', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    pick(new File(['video'], 'intro.mp4', { type: 'video/mp4' }));
    expect(media.createAsset).not.toHaveBeenCalled();
  });
});
