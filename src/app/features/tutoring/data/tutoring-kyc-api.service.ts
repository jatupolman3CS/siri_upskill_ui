import { HttpEventType } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { UPLOAD_HTTP_CLIENT } from '../../../core/http/upload-http-client';
import type { CreateKycCaseRequest, KycCase, KycDocument, KycUploadEvent, KycDocumentType, TutorKycStatus } from './tutoring-kyc.models';
import type { Guid } from './tutoring-public.models';

const BASE = '/tutoring/tutor/kyc';

/** Extensions the API accepts; the only part of the original file name that is ever sent. */
const SAFE_EXTENSION = /^\.[a-z0-9]{1,5}$/;

/**
 * Tutor identity-verification endpoints of P13-02 (`InstructorOnly`, so reachable before the tutor is verified).
 *
 * Privacy contract of this service: a document goes up and never comes back. There is no method that reads a document,
 * lists a file name or builds a URL for one, and none may be added here - the server has no such route for tutors.
 * The original file name is not sent either: the server only needs the extension to cross-check the file's content, so the
 * part is named `kyc-document<ext>`.
 *
 * Every endpoint answers `503 tutoring.kyc.disabled` while the feature is switched off server-side.
 */
@Injectable({ providedIn: 'root' })
export class TutoringKycApiService extends ApiService {
  private readonly injector = inject(Injector);

  getStatus(): Observable<TutorKycStatus> {
    return this.get<TutorKycStatus>(BASE);
  }

  /**
   * Opens a draft case. `consentVersion` must be the version the tutor was shown (`409 tutoring.kyc.consent_outdated`
   * carries `currentVersion` when it moved on in the meantime). The consent timestamp is taken by the server.
   */
  createCase(request: CreateKycCaseRequest): Observable<KycCase> {
    return this.post<KycCase>(`${BASE}/cases`, request);
  }

  /**
   * Uploads one document as `multipart/form-data` (`type`, optional `expiresOn` as `yyyy-MM-dd`, and the part `file`).
   * Emits `progress` (0-100) and finally `done`, then completes. Goes through the XHR-backed client because the app's
   * `fetch` client cannot report upload progress (see `UPLOAD_HTTP_CLIENT`). Unsubscribing aborts the request.
   */
  uploadDocument(caseId: Guid, type: KycDocumentType, file: File, expiresOn: string | null): Observable<KycUploadEvent> {
    const body = new FormData();
    body.append('type', type);
    if (expiresOn) {
      body.append('expiresOn', expiresOn);
    }
    body.append('file', file, `kyc-document${extensionOf(file.name)}`);
    return this.injector
      .get(UPLOAD_HTTP_CLIENT)
      .post<KycDocument>(`${this.apiBaseUrl}${BASE}/cases/${encodeURIComponent(caseId)}/documents`, body, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        map((event): KycUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            return { type: 'progress', percent: Math.min(100, Math.max(0, percent)) };
          }
          return event.type === HttpEventType.Response && event.body ? { type: 'done', document: event.body } : null;
        }),
        filter((event): event is KycUploadEvent => event !== null),
      );
  }

  /** Allowed while the case is `Draft` / `NeedsInfo` and the document is not approved yet (`409 tutoring.kyc.document_locked`). */
  deleteDocument(caseId: Guid, documentId: Guid): Observable<void> {
    return this.delete<void>(`${BASE}/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}`);
  }

  /** Sends the case for review; the server also moves the tutor profile to `PendingVerification`. */
  submitCase(caseId: Guid): Observable<KycCase> {
    return this.post<KycCase>(`${BASE}/cases/${encodeURIComponent(caseId)}/submit`, {});
  }
}

/** The lower-case extension of a file name (with its dot) when it is short and plain, otherwise nothing. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  return SAFE_EXTENSION.test(extension) ? extension : '';
}
