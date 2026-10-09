import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { LearnPage } from './learn-page';
import { AuthService } from '../../../core/auth/auth.service';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { EpisodeProgressResponse, PlaybackSessionResponse } from '../data/learning-api.models';

interface ClassroomAccess {
  readonly playbackError: Signal<string | null>;
  readonly playbackRetryable: Signal<boolean>;
  retryPlayback(): void;
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
        useValue: {
          paramMap: new BehaviorSubject(convertToParamMap({ slug: 'owned-course' })),
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
        },
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
        useValue: {
          paramMap: new BehaviorSubject(convertToParamMap({ slug: 'public-course' })),
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
        },
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

interface LiveTabAccess {
  readonly activeTab: Signal<string>;
  readonly liveTabVisible: Signal<boolean>;
  onLiveTabUnavailable(): void;
  selectEpisode(id: string, updateUrl?: boolean): void;
}

describe('LearnPage live tab', () => {
  let fixture: ComponentFixture<LearnPage>;
  let httpMock: HttpTestingController;
  let page: LiveTabAccess;
  let paramMap: BehaviorSubject<ParamMap>;

  function open(options: { readonly deliveryFormat?: string; readonly enrolled: boolean; readonly tab?: string }): void {
    paramMap = new BehaviorSubject(convertToParamMap({ slug: 'hybrid-course' }));
    TestBed.configureTestingModule({
      imports: [LearnPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), {
        provide: ActivatedRoute,
        useValue: {
          paramMap,
          queryParamMap: new BehaviorSubject(convertToParamMap(options.tab ? { tab: options.tab } : {})),
        },
      }],
    }).overrideComponent(LearnPage, { set: { template: '', imports: [] } });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AuthService), 'isAuthenticated').mockReturnValue(options.enrolled);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LearnPage);
    page = fixture.componentInstance as unknown as LiveTabAccess;
    fixture.detectChanges();

    httpMock.expectOne('/api/catalog/courses/hybrid-course').flush({
      id: 'course-1', slug: 'hybrid-course', title: 'Hybrid course',
      ...(options.deliveryFormat ? { deliveryFormat: options.deliveryFormat } : {}),
      sections: [{ id: 'section-1', episodes: [
        { id: 'episode-1', durationSeconds: 240, isFreePreview: true },
        { id: 'episode-2', durationSeconds: 240, isFreePreview: true },
      ] }],
    });

    if (options.enrolled) {
      httpMock.expectOne('/api/learning/enrollments/me?page=1&pageSize=50').flush({
        items: [{ id: 'enrollment-1', courseId: 'course-1', status: 'Active', progressPercent: 0 }],
        page: 1, pageSize: 50, totalCount: 1,
      });
      // Let the deep-link effect run now, *before* the progress response triggers the initial episode selection —
      // that is the real-world ordering, and the one a programmatic selection must not undo.
      fixture.detectChanges();
      httpMock.expectOne('/api/learning/enrollments/enrollment-1/episode-progress').flush([]);
      httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
    }
    httpMock.expectOne('/api/media/playback/episode-1').flush({ manifestUrl: 'episode-1.m3u8' });
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  it('shows the Live tab to an enrolled learner of a Hybrid or Live course', () => {
    open({ deliveryFormat: 'Hybrid', enrolled: true });
    expect(page.liveTabVisible()).toBe(true);
  });

  it('shows the Live tab for a purely Live course too', () => {
    open({ deliveryFormat: 'Live', enrolled: true });
    expect(page.liveTabVisible()).toBe(true);
  });

  it('hides the Live tab for an on-demand course', () => {
    open({ deliveryFormat: 'OnDemand', enrolled: true });
    expect(page.liveTabVisible()).toBe(false);
  });

  it('treats a missing deliveryFormat as on-demand and hides the tab', () => {
    open({ enrolled: true });
    expect(page.liveTabVisible()).toBe(false);
  });

  it('hides the Live tab from someone who is not enrolled, whatever the format', () => {
    open({ deliveryFormat: 'Hybrid', enrolled: false });
    expect(page.liveTabVisible()).toBe(false);
  });

  it('opens the Live tab for a ?tab=live deep link and keeps it when the initial episode is selected afterwards', () => {
    open({ deliveryFormat: 'Hybrid', enrolled: true, tab: 'live' });
    expect(page.activeTab()).toBe('live');
  });

  it('ignores ?tab=live when the course has no Live tab', () => {
    open({ deliveryFormat: 'OnDemand', enrolled: true, tab: 'live' });
    expect(page.activeTab()).toBe('overview');
  });

  it('hides the tab quietly and falls back to the overview when the tab reports no enrollment (404)', () => {
    open({ deliveryFormat: 'Hybrid', enrolled: true, tab: 'live' });
    expect(page.activeTab()).toBe('live');
    page.onLiveTabUnavailable();
    fixture.detectChanges();
    expect(page.liveTabVisible()).toBe(false);
    expect(page.activeTab()).toBe('overview');
  });

  it('leaves the Live tab when the learner picks an episode from the sidebar', () => {
    open({ deliveryFormat: 'Hybrid', enrolled: true, tab: 'live' });
    page.selectEpisode('episode-2');
    httpMock.expectOne('/api/media/playback/episode-2').flush({ manifestUrl: 'episode-2.m3u8' });
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
    expect(page.activeTab()).toBe('overview');
  });

  it('leaves the Live tab when a replay link routes to an episode', () => {
    open({ deliveryFormat: 'Hybrid', enrolled: true, tab: 'live' });
    paramMap.next(convertToParamMap({ slug: 'hybrid-course', episodeId: 'episode-2' }));
    httpMock.expectOne('/api/media/playback/episode-2').flush({ manifestUrl: 'episode-2.m3u8' });
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
    expect(page.activeTab()).toBe('overview');
  });
});

describe('LearnPage playback failure while the video provider is not configured', () => {
  let fixture: ComponentFixture<LearnPage>;
  let page: ClassroomAccess;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LearnPage],
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting(), provideRouter([]), {
        provide: ActivatedRoute,
        useValue: {
          paramMap: new BehaviorSubject(convertToParamMap({ slug: 'owned-course' })),
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
        },
      }],
    }).overrideComponent(LearnPage, { set: { template: '', imports: [] } });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AuthService), 'isAuthenticated').mockReturnValue(true);
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(LearnPage);
    page = fixture.componentInstance as unknown as ClassroomAccess;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/catalog/courses/owned-course').flush({
      id: 'course-1', slug: 'owned-course', title: 'Owned course',
      sections: [{ id: 'section-1', episodes: [{ id: 'episode-1', durationSeconds: 240, isFreePreview: false }] }],
    });
    httpMock.expectOne('/api/learning/enrollments/me?page=1&pageSize=50').flush({
      items: [{ id: 'enrollment-1', courseId: 'course-1', status: 'Active', progressPercent: 0 }],
      page: 1, pageSize: 50, totalCount: 1,
    });
    httpMock.expectOne('/api/learning/enrollments/enrollment-1/episode-progress').flush([]);
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
  });

  afterEach(() => httpMock.verify());

  it('explains the outage in plain words and lets the learner retry (503 video.provider_not_configured)', () => {
    httpMock.expectOne('/api/media/playback/episode-1').flush(
      { title: 'Video provider is not configured.', status: 503, errorCode: 'video.provider_not_configured' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(page.playbackError()).toBe('Video uploads and playback are temporarily unavailable. Please try again later.');
    expect(page.playbackRetryable()).toBe(true);

    page.retryPlayback();
    httpMock.expectOne('/api/media/playback/episode-1').flush({ manifestUrl: 'episode-1.m3u8' });
    httpMock.expectOne((request) => request.url === '/api/community/discussions').flush({ items: [] });
    expect(page.playbackError()).toBeNull();
    expect(page.playbackRetryable()).toBe(false);
  });

  it('keeps the existing no-access message, without a retry, for a 403', () => {
    httpMock.expectOne('/api/media/playback/episode-1').flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });

    expect(page.playbackRetryable()).toBe(false);
    // Resolved through i18n, so it follows the active locale (this block runs in English).
    expect(page.playbackError()).toBe('You cannot access this video. Please enroll in the course or check your access rights.');
  });

  it('localizes the classroom document title with the course title', () => {
    httpMock.expectOne('/api/media/playback/episode-1').flush({ manifestUrl: 'episode-1.m3u8' });
    expect(TestBed.inject(Title).getTitle()).toBe('Classroom: Owned course | SIRI UpSkill');
  });
});

describe('LearnPage — a course taught live that has no lessons', () => {
  let fixture: ComponentFixture<LearnPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LearnPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), {
        provide: ActivatedRoute,
        useValue: {
          paramMap: new BehaviorSubject(convertToParamMap({ slug: 'live-only' })),
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
        },
      }],
    });
    vi.spyOn(TestBed.inject(AuthService), 'isAuthenticated').mockReturnValue(false);
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(LearnPage);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('tells the learner there is no video to play instead of showing a spinner that never ends', () => {
    httpMock.expectOne('/api/catalog/courses/live-only').flush({
      id: 'course-1', slug: 'live-only', title: 'Live only', deliveryFormat: 'Live', sections: [],
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('This course is taught live and has no video lessons yet');
    expect(text).not.toContain('กำลังเตรียมเครื่องเล่นวิดีโอ');
  });
});
