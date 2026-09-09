import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LearningApiService } from './learning-api.service';

describe('LearningApiService integration contracts', () => {
  let service: LearningApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LearningApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads every page of owned enrollments without consulting the public catalog', () => {
    const received = vi.fn();
    service.getAllMyEnrollments().subscribe(received);
    httpMock.expectOne('/api/learning/enrollments/me?page=1&pageSize=50').flush({
      items: Array.from({ length: 50 }, (_, i) => ({ id: `enrollment-${i}` })),
      page: 1, pageSize: 50, totalCount: 51,
    });
    expect(received).not.toHaveBeenCalled();
    httpMock.expectOne('/api/learning/enrollments/me?page=2&pageSize=50').flush({
      items: [{ id: 'enrollment-50', courseSlug: 'owned-course-outside-public-page' }],
      page: 2, pageSize: 50, totalCount: 51,
    });
    expect(received.mock.calls[0][0]).toHaveLength(51);
    expect(received.mock.calls[0][0][50].courseSlug).toBe('owned-course-outside-public-page');
    httpMock.expectNone((request) => request.url.includes('/catalog/'));
  });

  it('restores the API lastPositionSeconds as the player resume position', () => {
    const received = vi.fn();
    service.getEpisodeProgressList('enrollment-1').subscribe(received);
    httpMock.expectOne('/api/learning/enrollments/enrollment-1/episode-progress').flush([
      { episodeId: 'episode-1', lastPositionSeconds: 123, watchedSeconds: 160, isCompleted: false },
    ]);
    expect(received).toHaveBeenCalledWith([
      expect.objectContaining({ episodeId: 'episode-1', positionSeconds: 123, watchedSeconds: 160 }),
    ]);
  });

  it('persists real progress and exposes request failures to the caller', () => {
    const failure = vi.fn();
    const data = { lastPositionSeconds: 75, watchedSeconds: 90, isCompleted: false };
    service.saveEpisodeProgress('enrollment-1', 'episode-1', data).subscribe({ error: failure });
    const request = httpMock.expectOne('/api/learning/enrollments/enrollment-1/episode-progress/episode-1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(data);
    request.flush(null, { status: 403, statusText: 'Forbidden' });
    expect(failure).toHaveBeenCalled();
  });
});
