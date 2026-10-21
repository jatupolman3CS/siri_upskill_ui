import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type { PagedResult } from '../../../core/http/paged-result.model';
import type { PackageOffer } from './tutoring-packages.models';
import type {
  IntroVideoPlayback,
  PublicSubjectItem,
  TutorPublicProfile,
  TutorSearchQuery,
  TutorSearchResponse,
  TutorSlotsQuery,
  TutorSlotsResponse,
} from './tutoring-public.models';
import type { TutorReviewsQuery, TutorReviewsResponse } from './tutoring-review.models';

/** Page size used to load the whole subject taxonomy in one request (contract default `200`, max `500`). */
const SUBJECTS_PAGE_SIZE = 200;

/**
 * Public (anonymous) Tutor Marketplace endpoints (P13-03 slots, P13-04 search / profile / subjects / intro video).
 * Components never call `HttpClient` directly (frontend.md) - they go through here.
 *
 * Errors surface as `ApiError`; resolve the stable RFC 9457 `reason` with `tutoringErrorKey()` (`tutoring-errors.ts`).
 * Every endpoint is cacheable/rate-limited server-side, and none carries user data - they are safe to call during SSR.
 */
@Injectable({ providedIn: 'root' })
export class TutoringPublicApiService extends ApiService {
  searchTutors(query: TutorSearchQuery): Observable<TutorSearchResponse> {
    return this.get<TutorSearchResponse>('/tutoring/tutors', { ...query });
  }

  /** `404 tutoring.tutor_not_found` for every non-public state (unknown slug, draft, suspended, unlisted, no offering). */
  getTutorProfile(slug: string): Observable<TutorPublicProfile> {
    return this.get<TutorPublicProfile>(`/tutoring/tutors/${encodeURIComponent(slug)}`);
  }

  /**
   * Short-lived playback URL of the tutor's intro video. Built from the slug rather than from the DTO's `playbackPath`
   * so the request can only ever target this one endpoint (the DTO path carries its own `/api` prefix).
   * `404` = no ready video (or not public), `503` = the video provider is unavailable - both mean "hide the block".
   */
  getIntroVideo(slug: string): Observable<IntroVideoPlayback> {
    return this.get<IntroVideoPlayback>(`/tutoring/tutors/${encodeURIComponent(slug)}/intro-video`);
  }

  /** Active subjects and groups, ordered parents-first then by `sortOrder`. */
  listSubjects(parentSlug?: string): Observable<PagedResult<PublicSubjectItem>> {
    return this.get<PagedResult<PublicSubjectItem>>('/tutoring/subjects', {
      parent: parentSlug,
      page: 1,
      pageSize: SUBJECTS_PAGE_SIZE,
    });
  }

  getTutorSlots(slug: string, query: TutorSlotsQuery): Observable<TutorSlotsResponse> {
    return this.get<TutorSlotsResponse>(`/tutoring/tutors/${encodeURIComponent(slug)}/slots`, { ...query });
  }

  /**
   * The tutor's active one-on-one packages (P13-12 section 5.6), priced by the server; `404 tutoring.tutor_not_found` for every
   * non-public tutor, like the profile. The C# controller returns `IReadOnlyList<PackageOffer>` (plain array).
   */
  listTutorPackages(slug: string): Observable<readonly PackageOffer[]> {
    return this.get<readonly PackageOffer[]>(`/tutoring/tutors/${encodeURIComponent(slug)}/packages`);
  }

  /**
   * Public reviews of the tutor (P13-13 section 12): summary (rating, count, distribution) + paged reviews.
   * `404 tutoring.tutor_not_found` when the tutor is not publicly visible.
   */
  getTutorReviews(slug: string, query?: TutorReviewsQuery): Observable<TutorReviewsResponse> {
    return this.get<TutorReviewsResponse>(`/tutoring/tutors/${encodeURIComponent(slug)}/reviews`, { ...query });
  }
}
