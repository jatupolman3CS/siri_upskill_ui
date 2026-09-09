import { Injectable } from '@angular/core';
import { Observable, repeat, retry, takeWhile, throwError, timer } from 'rxjs';
import { Upload } from 'tus-js-client';

import { ApiService } from '../../../core/http/api.service';
import {
  CreateMediaAssetCommand,
  MediaAssetResponse,
  MediaUploadSessionResponse,
} from './media-api.models';

export interface UploadProgressEvent {
  readonly progress: number; // 0 to 100
  readonly isComplete: boolean;
}

@Injectable({ providedIn: 'root' })
export class MediaApiService extends ApiService {
  createAsset(command: CreateMediaAssetCommand): Observable<MediaAssetResponse> {
    return this.post<MediaAssetResponse>('/media/assets', command);
  }

  getAsset(id: string): Observable<MediaAssetResponse> {
    return this.get<MediaAssetResponse>(`/media/assets/${encodeURIComponent(id)}`);
  }

  createUploadSession(mediaAssetId: string): Observable<MediaUploadSessionResponse> {
    return this.post<MediaUploadSessionResponse>(`/media/assets/${encodeURIComponent(mediaAssetId)}/upload-sessions`, {});
  }

  completeUploadSession(sessionId: string): Observable<MediaUploadSessionResponse> {
    return this.post<MediaUploadSessionResponse>(`/media/upload-sessions/${encodeURIComponent(sessionId)}/complete`, {}).pipe(
      retry({ count: 5, delay: (error) => error.status === 409 ? timer(1000) : throwError(() => error) }),
    );
  }

  watchAsset(id: string): Observable<MediaAssetResponse> {
    return this.getAsset(id).pipe(
      repeat({ delay: 3000 }),
      takeWhile((asset) => asset.status === 'Uploading' || asset.status === 'Processing', true),
    );
  }

  validateVideoFile(file: File): string | null {
    if (file.size === 0) return 'instructor.builder.upload.emptyFile';
    if (!file.type.startsWith('video/') && !(file.type === '' && /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name))) {
      return 'instructor.builder.upload.invalidType';
    }
    return null;
  }

  /**
   * Uploads the video file to the provider's upload URL with real-time progress.
   */
  uploadVideoFile(
    uploadUrl: string,
    file: File,
  ): Observable<UploadProgressEvent> {
    return new Observable<UploadProgressEvent>((subscriber) => {
      const fileError = this.validateVideoFile(file);
      if (fileError) {
        subscriber.error(new Error(fileError));
        return;
      }

      let endpoint: URL;
      const headers: Record<string, string> = {};
      try {
        endpoint = new URL(uploadUrl);
        if (endpoint.origin !== 'https://video.bunnycdn.com' || endpoint.pathname !== '/tusupload') throw new Error();
        for (const name of ['AuthorizationSignature', 'AuthorizationExpire', 'LibraryId', 'VideoId']) {
          const value = endpoint.searchParams.get(name);
          if (!value) throw new Error();
          headers[name] = value;
        }
        endpoint.search = '';
        endpoint.hash = '';
      } catch {
        subscriber.error(new Error('instructor.builder.upload.invalidSession'));
        return;
      }

      // TUS sends its own provider headers through XHR, outside the application's bearer interceptor.
      const upload = new Upload(file, {
        endpoint: endpoint.href,
        headers,
        metadata: { filetype: file.type || 'application/octet-stream', title: file.name },
        chunkSize: 8 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        storeFingerprintForResuming: false,
        onProgress: (sent, total) => subscriber.next({
          progress: total > 0 ? Math.min(99, Math.round(sent / total * 100)) : 0,
          isComplete: false,
        }),
        onSuccess: () => {
          subscriber.next({ progress: 100, isComplete: true });
          subscriber.complete();
        },
        // Provider errors can contain signed URLs; expose a safe message instead.
        onError: () => subscriber.error(new Error('instructor.builder.upload.transferFailed')),
      });
      upload.start();
      return () => { void upload.abort().catch(() => undefined); };
    });
  }
}
