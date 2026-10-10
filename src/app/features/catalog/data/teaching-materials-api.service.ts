import { HttpEventType } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { UPLOAD_HTTP_CLIENT } from '../../../core/http/upload-http-client';
import type {
  TeachingMaterial,
  TeachingMaterialDownload,
  TeachingMaterialKind,
  TeachingMaterialUploadEvent,
} from './teaching-materials.models';

/**
 * Teaching materials (P4-03c): the Catalog endpoints that list, upload, delete and download the documents attached to an
 * episode (`/catalog/episodes/{id}/attachments`) or to a live session (`/catalog/live-sessions/{id}/attachments`). One
 * method set serves both families — `kind` picks the route; the two answer with the same shapes.
 *
 * The server alone decides who may read or change a file and what a valid file is; nothing here (or in the UI) is a gate.
 * Errors surface as `ApiError` — turn them into a message with `teachingMaterialErrorMessage`.
 */
@Injectable({ providedIn: 'root' })
export class TeachingMaterialsApiService extends ApiService {
  private readonly injector = inject(Injector);

  list(kind: TeachingMaterialKind, parentId: string): Observable<readonly TeachingMaterial[]> {
    return this.get<readonly TeachingMaterial[]>(collectionPath(kind, parentId));
  }

  /**
   * A fresh signed download URL (valid for a few minutes). Ask for it at the moment of the click and use it at once; storing
   * or re-using it later just yields an expired link.
   */
  getDownload(kind: TeachingMaterialKind, parentId: string, attachmentId: string): Observable<TeachingMaterialDownload> {
    return this.get<TeachingMaterialDownload>(`${collectionPath(kind, parentId)}/${encodeURIComponent(attachmentId)}/download`);
  }

  remove(kind: TeachingMaterialKind, parentId: string, attachmentId: string): Observable<void> {
    return this.delete<void>(`${collectionPath(kind, parentId)}/${encodeURIComponent(attachmentId)}`);
  }

  /**
   * Uploads one file as `multipart/form-data` (single part named `file`; the browser sets the `Content-Type` boundary).
   * Emits `progress` (0–100 of the request body sent) and finally `done` with the stored file, then completes.
   *
   * Goes through the XHR-backed client because the app's `fetch` client cannot report upload progress
   * (see `UPLOAD_HTTP_CLIENT`).
   */
  upload(kind: TeachingMaterialKind, parentId: string, file: File): Observable<TeachingMaterialUploadEvent> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.injector
      .get(UPLOAD_HTTP_CLIENT)
      .post<TeachingMaterial>(`${this.apiBaseUrl}${collectionPath(kind, parentId)}`, body, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        map((event): TeachingMaterialUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            return { type: 'progress', percent: Math.min(100, Math.max(0, percent)) };
          }
          return event.type === HttpEventType.Response && event.body ? { type: 'done', material: event.body } : null;
        }),
        filter((event): event is TeachingMaterialUploadEvent => event !== null),
      );
  }
}

function collectionPath(kind: TeachingMaterialKind, parentId: string): string {
  const segment = kind === 'episode' ? 'episodes' : 'live-sessions';
  return `/catalog/${segment}/${encodeURIComponent(parentId)}/attachments`;
}
