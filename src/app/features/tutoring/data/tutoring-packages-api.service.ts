import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { Guid, TutorPackage, UpsertPackageRequest } from './tutoring-packages.models';
import type { PagedResult } from './tutoring-tutor.models';

const BASE = '/tutoring/tutor/packages';
/** A tutor may have at most 20 active packages (`MaxActivePackagesPerTutor`); the server caps `pageSize` at 50 (a larger value is a 400), enough to load every one of them. */
const LIST_PAGE_SIZE = 50;

/**
 * Tutor package endpoints of P13-12 (section 5.6, `TutorOnly`). The tutor is the caller; no id of a tutor or buyer appears in
 * any path, query or body. Prices in every answer are the server's.
 */
@Injectable({ providedIn: 'root' })
export class TutoringPackagesApiService extends ApiService {
  /**
   * Reads the tutor's packages from `GET /api/tutoring/tutor/packages`.
   * The C# controller returns `PagedResult<TutorPackageResponse>`.
   */
  listPackages(): Observable<readonly TutorPackage[]> {
    return this.get<PagedResult<TutorPackage>>(BASE, { page: 1, pageSize: LIST_PAGE_SIZE }).pipe(
      map((body) => body.items),
    );
  }

  /** `409 tutoring.package_duplicate_shape` / `tutoring.package_limit`, `400 tutoring.package_price_below_minimum` or a field-level validation answer. */
  createPackage(request: UpsertPackageRequest): Observable<TutorPackage> {
    return this.post<TutorPackage>(BASE, request);
  }

  updatePackage(packageId: Guid, request: UpsertPackageRequest): Observable<TutorPackage> {
    return this.put<TutorPackage>(`${BASE}/${encodeURIComponent(packageId)}`, request);
  }

  /** Stops new sales; credits that were already sold stay usable. The body of the answer is not relied on. */
  deactivatePackage(packageId: Guid): Observable<unknown> {
    return this.post<unknown>(`${BASE}/${encodeURIComponent(packageId)}/deactivate`, {});
  }
}
