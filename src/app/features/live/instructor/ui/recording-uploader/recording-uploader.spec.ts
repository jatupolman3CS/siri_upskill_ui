import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import type { MediaAssetResponse } from '../../../../media/data/media-api.models';
import { MediaApiService } from '../../../../media/data/media-api.service';
import type { LiveSessionRecording } from '../../../data/live-instructor.models';
import { RecordingUploader } from './recording-uploader';

const RECORDING_URL = '/api/catalog/instructor/courses/c1/live-sessions/s1/recording';

function asset(status: MediaAssetResponse['status']): MediaAssetResponse {
  return {
    id: 'm1',
    provider: 'bunny',
    providerAssetId: 'p1',
    playbackId: null,
    status,
    durationSeconds: 3600,
    drmEnabled: false,
    thumbnailUrl: null,
    uploadedByUserId: 'u1',
    readyAtUtc: null,
    errorMessage: null,
    createdAtUtc: '2026-10-08T05:00:00Z',
  };
}

describe('RecordingUploader', () => {
  let fixture: ComponentFixture<RecordingUploader>;
  let httpMock: HttpTestingController;
  let media: {
    validateVideoFile: ReturnType<typeof vi.fn>;
    createAsset: ReturnType<typeof vi.fn>;
    createUploadSession: ReturnType<typeof vi.fn>;
    uploadVideoFile: ReturnType<typeof vi.fn>;
    completeUploadSession: ReturnType<typeof vi.fn>;
    watchAsset: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    media = {
      validateVideoFile: vi.fn().mockReturnValue(null),
      createAsset: vi.fn().mockReturnValue(of(asset('Uploading'))),
      createUploadSession: vi.fn().mockReturnValue(of({ id: 'sess1', uploadUrl: 'https://video.bunnycdn.com/tusupload?x=1' })),
      uploadVideoFile: vi.fn().mockReturnValue(of({ progress: 50, isComplete: false }, { progress: 100, isComplete: true })),
      completeUploadSession: vi.fn().mockReturnValue(of({ id: 'sess1' })),
      watchAsset: vi.fn().mockReturnValue(of(asset('Processing'), asset('Ready'))),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MediaApiService, useValue: media },
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RecordingUploader);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('sessionTitle', 'Excel basics');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const root = () => fixture.nativeElement as HTMLElement;
  const pick = (file: File) => {
    const input = root().querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const video = () => new File(['x'], 'session.mp4', { type: 'video/mp4' });

  it('offers "Upload recording" when none is attached and "Replace" when one is', () => {
    expect(root().textContent).toContain('Upload recording');
    fixture.componentRef.setInput('hasRecording', true);
    fixture.detectChanges();
    expect(root().textContent).toContain('Replace recording');
  });

  it('rejects an invalid file with the shared upload message and starts nothing', () => {
    media.validateVideoFile.mockReturnValue('instructor.builder.upload.invalidType');
    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(media.createAsset).not.toHaveBeenCalled();
    expect(root().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('uploads, waits for the asset to be Ready, then attaches it to the session and emits the result', () => {
    const emitted: LiveSessionRecording[] = [];
    fixture.componentInstance.attached.subscribe((recording) => emitted.push(recording));

    pick(video());
    expect(media.createAsset).toHaveBeenCalledWith({ title: 'Excel basics — recording' });
    expect(media.watchAsset).toHaveBeenCalledWith('m1');

    const req = httpMock.expectOne(RECORDING_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ mediaAssetId: 'm1' });
    const recording = { sessionId: 's1', recordingEpisodeId: 'e1', replacedExisting: false } as LiveSessionRecording;
    req.flush(recording);

    expect(emitted).toEqual([recording]);
  });

  it('never attaches an asset that finished as Failed', () => {
    media.watchAsset.mockReturnValue(of(asset('Processing'), asset('Failed')));
    pick(video());
    fixture.detectChanges();

    httpMock.expectNone(RECORDING_URL);
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('could not be processed');
  });

  it('a failed transfer shows a safe message and attaches nothing', () => {
    media.uploadVideoFile.mockReturnValue(
      throwError(() => new Error('https://video.bunnycdn.com/tusupload?AuthorizationSignature=secret')),
    );
    pick(video());
    fixture.detectChanges();

    httpMock.expectNone(RECORDING_URL);
    expect(root().textContent).toContain('Video upload failed');
    expect(root().textContent).not.toContain('AuthorizationSignature');
  });

  it('a 409 asset-not-ready on attach shows the message and lets the instructor retry without uploading again', () => {
    pick(video());
    httpMock.expectOne(RECORDING_URL).flush({ reason: 'live.recording_asset_not_ready' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    const retry = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Try attaching again'));
    expect(retry).toBeDefined();

    media.createAsset.mockClear();
    (retry as HTMLButtonElement).click();
    const second = httpMock.expectOne(RECORDING_URL);
    expect(second.request.body).toEqual({ mediaAssetId: 'm1' });
    second.flush({ sessionId: 's1', recordingEpisodeId: 'e1', replacedExisting: false });
    expect(media.createAsset).not.toHaveBeenCalled();
  });
});
