import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpHeaders, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

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
  private readonly rawHttp = inject(HttpClient);

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
    return this.post<MediaUploadSessionResponse>(`/media/upload-sessions/${encodeURIComponent(sessionId)}/complete`, {});
  }

  /**
   * Uploads the video file to the provider's upload URL with real-time progress.
   */
  uploadVideoFile(
    uploadUrl: string,
    file: File,
  ): Observable<UploadProgressEvent> {
    const headers = new HttpHeaders({
      'Content-Type': file.type || 'application/octet-stream',
    });
    const req = new HttpRequest('PUT', uploadUrl, file, {
      reportProgress: true,
      headers,
    });

    return this.rawHttp.request(req).pipe(
      filter(event => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
      map((event: HttpEvent<unknown>) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total ?? file.size;
          const progress = total > 0 ? Math.round((100 * event.loaded) / total) : 0;
          return { progress: Math.min(progress, 99), isComplete: false };
        }
        return { progress: 100, isComplete: true };
      }),
    );
  }
}
