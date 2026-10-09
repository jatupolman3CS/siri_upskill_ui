import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { LiveAdminStatus } from './live-admin.models';

/**
 * Admin-side Live operations. Components never call `HttpClient` (frontend.md) — they go through here. The endpoint is
 * AdminOnly and answers `Cache-Control: no-store`, so every call reflects the server's current state.
 */
@Injectable({ providedIn: 'root' })
export class LiveAdminApiService extends ApiService {
  /** `GET /api/live/admin/status` — health of the pieces the Live feature depends on (job server, e-mail outbox, Google). */
  getStatus(): Observable<LiveAdminStatus> {
    return this.get<LiveAdminStatus>('/live/admin/status');
  }
}
