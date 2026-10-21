import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import { tutoringErrorKey } from './tutoring-errors';
import { TutoringTutorApiService } from './tutoring-tutor-api.service';
import type { TutorOffering, TutorProfile, UpsertOfferingRequest } from './tutoring-tutor.models';

const PROFILE: TutorProfile = {
  tutorId: 't1',
  slug: 'nina-tutor',
  displayName: 'Nina Tutor',
  headline: 'Physics',
  bio: 'About me',
  gender: 'Female',
  yearsExperience: 6,
  status: 'Draft',
  statusReason: null,
  isListed: false,
  photoUrl: null,
  introVideoAssetId: null,
  minNoticeHours: 24,
  bufferMinutes: 10,
  maxAdvanceDays: 60,
  verifiedAtUtc: null,
  readiness: { canSubmitForVerification: false, blockers: ['no_active_offering'] },
  rowVersion: 'AAAAAAAAB9E=',
};

const OFFERING_REQUEST: UpsertOfferingRequest = {
  subjectId: 'sub-1',
  level: 'UpperSecondary',
  curriculum: 'Thai',
  hourlyRateOneOnOne: 450,
  groupHourlyRatePerSeat: null,
  groupMaxSeats: null,
  trialEnabled: false,
  trialMinutes: null,
  trialPrice: null,
  isActive: true,
};

describe('TutoringTutorApiService', () => {
  let service: TutoringTutorApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // withFetch() + the real error interceptor: matches app.config.ts, not the plain XHR default.
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringTutorApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the profile from GET /tutoring/tutor/profile', () => {
    const received = vi.fn();
    service.getProfile().subscribe(received);
    const req = httpMock.expectOne('/api/tutoring/tutor/profile');
    expect(req.request.method).toBe('GET');
    req.flush(PROFILE);
    expect(received).toHaveBeenCalledWith(PROFILE);
  });

  it('turns the "no profile yet" 404 into an ApiError that carries its stable reason', () => {
    let failure: unknown;
    service.getProfile().subscribe({ error: (error: unknown) => (failure = error) });
    httpMock
      .expectOne('/api/tutoring/tutor/profile')
      .flush({ status: 404, title: 'x', errorCode: 'not_found', reason: 'tutoring.tutor_profile_not_found' }, { status: 404, statusText: 'Not Found' });
    expect(failure).toBeInstanceOf(ApiError);
    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.tutorProfileNotFound');
  });

  it('creates with POST and never sends an owner id - only the profile fields', () => {
    service.createProfile({ displayName: 'Nina', headline: null, bio: 'b', gender: 'Female', yearsExperience: 2 }).subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/profile');
    expect(req.request.method).toBe('POST');
    expect(Object.keys(req.request.body as object).sort()).toEqual(['bio', 'displayName', 'gender', 'headline', 'yearsExperience']);
    req.flush(PROFILE, { status: 201, statusText: 'Created' });
  });

  it('updates with PUT and sends the row version back untouched', () => {
    service.updateProfile({ displayName: 'Nina', headline: null, bio: 'b', gender: 'Female', yearsExperience: 2, rowVersion: PROFILE.rowVersion }).subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/profile');
    expect(req.request.method).toBe('PUT');
    expect((req.request.body as { rowVersion: string }).rowVersion).toBe('AAAAAAAAB9E=');
    req.flush(PROFILE);
  });

  it('sets the listing at PUT /profile/listing', () => {
    service.setListing({ isListed: true, rowVersion: PROFILE.rowVersion }).subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/profile/listing');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isListed: true, rowVersion: PROFILE.rowVersion });
    req.flush(PROFILE);
  });

  it('uploads the photo as multipart with a single part named "file"', () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'me.jpg', { type: 'image/jpeg' });
    const received = vi.fn();
    service.uploadPhoto(file).subscribe(received);
    const req = httpMock.expectOne('/api/tutoring/tutor/profile/photo');
    expect(req.request.method).toBe('PUT');
    const body = req.request.body as FormData;
    expect([...body.keys()]).toEqual(['file']);
    req.flush({ photoUrl: 'https://r2.example/signed' });
    expect(received).toHaveBeenCalledWith({ photoUrl: 'https://r2.example/signed' });
  });

  it('removes the photo and the intro video with DELETE', () => {
    service.deletePhoto().subscribe();
    const photo = httpMock.expectOne('/api/tutoring/tutor/profile/photo');
    expect(photo.request.method).toBe('DELETE');
    photo.flush(null, { status: 204, statusText: 'No Content' });

    service.clearIntroVideo().subscribe();
    const video = httpMock.expectOne('/api/tutoring/tutor/profile/intro-video');
    expect(video.request.method).toBe('DELETE');
    video.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('links an intro video by media asset id only', () => {
    service.setIntroVideo({ mediaAssetId: 'asset-1' }).subscribe();
    const req = httpMock.expectOne('/api/tutoring/tutor/profile/intro-video');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mediaAssetId: 'asset-1' });
    req.flush(PROFILE);
  });

  it('lists offerings with an explicit page size and sends a full offering on create and update', () => {
    service.listOfferings().subscribe();
    const list = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/offerings');
    expect(list.request.params.get('page')).toBe('1');
    expect(list.request.params.get('pageSize')).toBe('100');
    list.flush({ items: [], totalCount: 0, page: 1, pageSize: 100, totalPages: 0 });

    service.createOffering(OFFERING_REQUEST).subscribe();
    const created = httpMock.expectOne('/api/tutoring/tutor/offerings');
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual(OFFERING_REQUEST);
    created.flush({} as TutorOffering, { status: 201, statusText: 'Created' });

    service.updateOffering('off/1', OFFERING_REQUEST).subscribe();
    const updated = httpMock.expectOne('/api/tutoring/tutor/offerings/off%2F1');
    expect(updated.request.method).toBe('PUT');
    updated.flush({} as TutorOffering);
  });

  it('exposes the existing twin of a duplicate offering so the page can re-open it', () => {
    let failure: unknown;
    service.createOffering(OFFERING_REQUEST).subscribe({ error: (error: unknown) => (failure = error) });
    httpMock
      .expectOne('/api/tutoring/tutor/offerings')
      .flush({ status: 409, errorCode: 'conflict', reason: 'tutoring.offering_duplicate', offeringId: 'off-9' }, { status: 409, statusText: 'Conflict' });
    expect(tutoringErrorKey(failure)).toBe('tutoring.errors.offeringDuplicate');
    expect((failure as ApiError).details).toMatchObject({ offeringId: 'off-9' });
  });

  it('covers education and certificate CRUD on their own paths', () => {
    const education = { institution: 'Chula', degree: 'B.Sc.', field: null, yearFrom: 2012, yearTo: 2016, sortOrder: 0 };
    const certificate = { title: 'Licence', issuer: null, year: 2018, sortOrder: 0 };

    service.listEducations().subscribe();
    httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/educations').flush({ items: [], totalCount: 0, page: 1, pageSize: 100, totalPages: 0 });
    service.createEducation(education).subscribe();
    expect(httpMock.expectOne('/api/tutoring/tutor/educations').request.method).toBe('POST');
    service.updateEducation('e1', education).subscribe();
    expect(httpMock.expectOne('/api/tutoring/tutor/educations/e1').request.method).toBe('PUT');
    service.deleteEducation('e1').subscribe();
    expect(httpMock.expectOne('/api/tutoring/tutor/educations/e1').request.method).toBe('DELETE');

    service.listCertificates().subscribe();
    httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/certificates').flush({ items: [], totalCount: 0, page: 1, pageSize: 100, totalPages: 0 });
    service.createCertificate(certificate).subscribe();
    expect(httpMock.expectOne('/api/tutoring/tutor/certificates').request.method).toBe('POST');
    service.updateCertificate('c1', certificate).subscribe();
    expect(httpMock.expectOne('/api/tutoring/tutor/certificates/c1').request.method).toBe('PUT');
    service.deleteCertificate('c1').subscribe();
    expect(httpMock.expectOne('/api/tutoring/tutor/certificates/c1').request.method).toBe('DELETE');
  });
});
