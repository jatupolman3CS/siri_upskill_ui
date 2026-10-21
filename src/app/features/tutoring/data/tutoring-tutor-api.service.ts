import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import type {
  CreateTutorProfileRequest,
  Guid,
  PagedResult,
  PhotoUploadResponse,
  SetIntroVideoRequest,
  SetListingRequest,
  TutorCertificate,
  TutorEducation,
  TutorOffering,
  TutorProfile,
  UpdateTutorProfileRequest,
  UpsertCertificateRequest,
  UpsertEducationRequest,
  UpsertOfferingRequest,
} from './tutoring-tutor.models';

/** Largest page the contract allows; every tutor-side list is capped well below it (30 offerings, 10 educations, 20 certificates). */
const LIST_PAGE_SIZE = 100;
const BASE = '/tutoring/tutor';

/**
 * Tutor Portal endpoints of P13-01 (profile, offerings, educations, certificates). All of them are `InstructorOnly`
 * on the server - a tutor who is not verified yet can still reach every one of them, which is the point: they are how a
 * tutor becomes verifiable. Whether a call is allowed is the server's decision; nothing here (or in a page) is a gate.
 *
 * The caller is always identified by the access token. There is no tutor id, user id or instructor id in any path, query
 * or body.
 *
 * Errors surface as `ApiError`; resolve the stable RFC 9457 `reason` with `tutoringErrorKey()` (`tutoring-errors.ts`).
 * A tutor who has not created a profile yet gets `404 tutoring.tutor_profile_not_found` from every read here.
 */
@Injectable({ providedIn: 'root' })
export class TutoringTutorApiService extends ApiService {
  // --- Profile -----------------------------------------------------------------------------------------------------

  getProfile(): Observable<TutorProfile> {
    return this.get<TutorProfile>(`${BASE}/profile`);
  }

  createProfile(request: CreateTutorProfileRequest): Observable<TutorProfile> {
    return this.post<TutorProfile>(`${BASE}/profile`, request);
  }

  /** A stale `rowVersion` answers `409 tutoring.concurrent_update`. */
  updateProfile(request: UpdateTutorProfileRequest): Observable<TutorProfile> {
    return this.put<TutorProfile>(`${BASE}/profile`, request);
  }

  /** Opening the listing needs a verified tutor with an active offering (`409 tutoring.tutor_not_verified` / `no_active_offering`). */
  setListing(request: SetListingRequest): Observable<TutorProfile> {
    return this.put<TutorProfile>(`${BASE}/profile/listing`, request);
  }

  /**
   * Replaces the profile photo. One `multipart/form-data` part named `file`; the server decides what a valid image is from
   * the bytes (the file name is neither read nor kept). Answers a fresh signed URL.
   */
  uploadPhoto(file: File): Observable<PhotoUploadResponse> {
    const body = new FormData();
    body.append('file', file);
    return this.put<PhotoUploadResponse>(`${BASE}/profile/photo`, body);
  }

  deletePhoto(): Observable<void> {
    return this.delete<void>(`${BASE}/profile/photo`);
  }

  /** Links a media asset that is `Ready` and owned by the caller (`MediaApiService` runs the upload itself). */
  setIntroVideo(request: SetIntroVideoRequest): Observable<TutorProfile> {
    return this.put<TutorProfile>(`${BASE}/profile/intro-video`, request);
  }

  clearIntroVideo(): Observable<void> {
    return this.delete<void>(`${BASE}/profile/intro-video`);
  }

  // --- Offerings (rows are never deleted - pause them with `isActive: false`) ------------------------------------------

  listOfferings(): Observable<PagedResult<TutorOffering>> {
    return this.get<PagedResult<TutorOffering>>(`${BASE}/offerings`, { page: 1, pageSize: LIST_PAGE_SIZE });
  }

  /** `409 tutoring.offering_duplicate` carries `offeringId` when the twin is a paused offering that can be re-opened instead. */
  createOffering(request: UpsertOfferingRequest): Observable<TutorOffering> {
    return this.post<TutorOffering>(`${BASE}/offerings`, request);
  }

  updateOffering(offeringId: Guid, request: UpsertOfferingRequest): Observable<TutorOffering> {
    return this.put<TutorOffering>(`${BASE}/offerings/${encodeURIComponent(offeringId)}`, request);
  }

  // --- Education -------------------------------------------------------------------------------------------------------

  listEducations(): Observable<PagedResult<TutorEducation>> {
    return this.get<PagedResult<TutorEducation>>(`${BASE}/educations`, { page: 1, pageSize: LIST_PAGE_SIZE });
  }

  createEducation(request: UpsertEducationRequest): Observable<TutorEducation> {
    return this.post<TutorEducation>(`${BASE}/educations`, request);
  }

  updateEducation(educationId: Guid, request: UpsertEducationRequest): Observable<TutorEducation> {
    return this.put<TutorEducation>(`${BASE}/educations/${encodeURIComponent(educationId)}`, request);
  }

  deleteEducation(educationId: Guid): Observable<void> {
    return this.delete<void>(`${BASE}/educations/${encodeURIComponent(educationId)}`);
  }

  // --- Certificates ----------------------------------------------------------------------------------------------------

  listCertificates(): Observable<PagedResult<TutorCertificate>> {
    return this.get<PagedResult<TutorCertificate>>(`${BASE}/certificates`, { page: 1, pageSize: LIST_PAGE_SIZE });
  }

  createCertificate(request: UpsertCertificateRequest): Observable<TutorCertificate> {
    return this.post<TutorCertificate>(`${BASE}/certificates`, request);
  }

  updateCertificate(certificateId: Guid, request: UpsertCertificateRequest): Observable<TutorCertificate> {
    return this.put<TutorCertificate>(`${BASE}/certificates/${encodeURIComponent(certificateId)}`, request);
  }

  deleteCertificate(certificateId: Guid): Observable<void> {
    return this.delete<void>(`${BASE}/certificates/${encodeURIComponent(certificateId)}`);
  }
}
