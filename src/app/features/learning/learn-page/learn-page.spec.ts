import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { LearnPage } from './learn-page';
import { AuthService } from '../../../core/auth/auth.service';
import { EpisodeProgressResponse, PlaybackSessionResponse } from '../data/learning-api.models';

interface ClassroomAccess {
  readonly enrollmentId: Signal<string | null>;
  readonly episodeProgress: Signal<EpisodeProgressResponse | null>;
  readonly playbackSession: Signal<PlaybackSessionResponse | null>;
  selectEpisode(id: string, updateUrl?: boolean): void;
  onHeartbeat(position: number): void;
}

describe('LearnPage progress integration', () => {
  let fixture: ComponentFixture<LearnPage>;
  let page: ClassroomAccess;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LearnPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), {
        provide: ActivatedRoute,
        useValue: { paramMap: new BehaviorSubject(convertToParamMap({ slug: 'owned-course' })) },
      }],
    }).overrideComponent(LearnPage, { set: { template: '', imports: [] } });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AuthService), 'isAuthenticated').mockReturnValue(true);
    fixture = TestBed.createComponent(LearnPage);
    page = fixture.componentInstance as unknown as ClassroomAccess;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/catalog/courses/owned-course').flush({
      id: 'course-1', slug: 'owned-course', title: 'Owned course',
      sections: [{ id: 'section-1', episodes: [
        { id: 'episode-1', durationSeconds: 240, isFreePreview: false },
        { id: 'episode-2', durationSeconds: 180, isFreePreview: false },
      ] }],
    });
  });

  afterEach(() => httpMock.verify());

  function restoreEnrollment(): void {
    httpMock.expectOne('/api/learning/enrollments/me?page=1&pageSize=50').flush({
      items: [{ id: 'enrollment-1', courseId: 'course-1', status: 'Active', progressPercent: 25 }],
      page: 1, pageSize: 50, totalCount: 1,
    });
    httpMock.expectOne('/api/learning/enrollments/enrollment-1/episode-progress').flush([
      { episodeId: 'episode-1', lastPositionSeconds: 125, watchedSeconds: 125, isCompleted: false },
    ]);
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
  }

  it('finds an enrollment beyond page one and restores progress before requesting playback', () => {
    httpMock.expectOne('/api/learning/enrollments/me?page=1&pageSize=50').flush({
      items: Array.from({ length: 50 }, (_, i) => ({ id: `other-${i}`, courseId: `other-course-${i}` })),
      page: 1, pageSize: 50, totalCount: 51,
    });
    httpMock.expectOne('/api/learning/enrollments/me?page=2&pageSize=50').flush({
      items: [{ id: 'enrollment-1', courseId: 'course-1', status: 'Active', progressPercent: 25 }],
      page: 2, pageSize: 50, totalCount: 51,
    });
    httpMock.expectNone('/api/media/playback/episode-1');
    httpMock.expectOne('/api/learning/enrollments/enrollment-1/episode-progress').flush([
      { episodeId: 'episode-1', lastPositionSeconds: 125, watchedSeconds: 125, isCompleted: false },
    ]);
    expect(page.enrollmentId()).toBe('enrollment-1');
    expect(page.episodeProgress()?.positionSeconds).toBe(125);
    httpMock.expectOne('/api/media/playback/episode-1').flush({ manifestUrl: 'saved-progress.m3u8' });
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
  });

  it('ignores a previous episode playback response after switching episodes', () => {
    restoreEnrollment();
    const oldPlayback = httpMock.expectOne('/api/media/playback/episode-1');
    page.selectEpisode('episode-2', false);
    httpMock.expectOne('/api/media/playback/episode-2').flush({ manifestUrl: 'episode-2.m3u8' });
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
    oldPlayback.flush({ manifestUrl: 'episode-1.m3u8' });
    expect(page.playbackSession()?.manifestUrl).toBe('episode-2.m3u8');
    expect(page.episodeProgress()).toBeNull();
  });

  it('does not replace the next episode progress with a late heartbeat from the previous episode', () => {
    restoreEnrollment();
    httpMock.expectOne('/api/media/playback/episode-1').flush({ manifestUrl: 'episode-1.m3u8' });
    page.onHeartbeat(150);
    const heartbeat = httpMock.expectOne('/api/learning/enrollments/enrollment-1/episode-progress/episode-1');
    expect(heartbeat.request.body.lastPositionSeconds).toBe(150);
    page.selectEpisode('episode-2', false);
    httpMock.expectOne('/api/media/playback/episode-2').flush({ manifestUrl: 'episode-2.m3u8' });
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
    heartbeat.flush({ episodeId: 'episode-1', lastPositionSeconds: 150, isCompleted: false });
    expect(page.episodeProgress()).toBeNull();
  });
});

describe('LearnPage anonymous preview', () => {
  let fixture: ComponentFixture<LearnPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LearnPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), {
        provide: ActivatedRoute,
        useValue: { paramMap: new BehaviorSubject(convertToParamMap({ slug: 'public-course' })) },
      }],
    }).overrideComponent(LearnPage, { set: { template: '', imports: [] } });
    vi.spyOn(TestBed.inject(AuthService), 'isAuthenticated').mockReturnValue(false);
    fixture = TestBed.createComponent(LearnPage);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('selects a free episode without requesting enrollment, discussions or saving progress', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/catalog/courses/public-course').flush({
      id: 'course-1', slug: 'public-course', title: 'Public course',
      sections: [{ id: 'section-1', episodes: [
        { id: 'paid', isFreePreview: false }, { id: 'preview', isFreePreview: true },
      ] }],
    });
    httpMock.expectOne('/api/media/playback/preview').flush({ manifestUrl: 'preview.m3u8' });
    const page = fixture.componentInstance as unknown as ClassroomAccess;
    expect(page.playbackSession()?.manifestUrl).toBe('preview.m3u8');
    expect(page.enrollmentId()).toBeNull();
    page.onHeartbeat(10);
    httpMock.expectNone(request => request.url.includes('/learning/') || request.url.includes('/community/'));
  });
});
