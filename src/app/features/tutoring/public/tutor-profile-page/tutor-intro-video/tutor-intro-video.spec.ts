import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { TutorIntroVideo } from './tutor-intro-video';

const MANIFEST = 'https://vz-abc.example.test/guid/playlist.m3u8?token=xyz';
const ENDPOINT = '/api/tutoring/tutors/nina-tutor/intro-video';

describe('TutorIntroVideo', () => {
  let fixture: ComponentFixture<TutorIntroVideo>;
  let httpMock: HttpTestingController;
  let unavailable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(TutorIntroVideo);
    fixture.componentRef.setInput('slug', 'nina-tutor');
    fixture.componentRef.setInput('displayName', 'Nina Tutor');
    fixture.componentRef.setInput('durationSeconds', 95);
    unavailable = vi.fn();
    fixture.componentInstance.unavailable.subscribe(unavailable as unknown as () => void);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const playButton = (): HTMLButtonElement => root().querySelector('button') as HTMLButtonElement;

  it('starts as a play card that names the tutor and shows the length - and has fetched nothing yet', () => {
    expect(playButton().getAttribute('aria-label')).toBe('Play the intro video of Nina Tutor');
    expect(root().textContent).toContain('1:35');
    expect(root().querySelector('video')).toBeNull();
    httpMock.expectNone(ENDPOINT);
  });

  it('keeps a fixed 16:9 box in every state so nothing shifts when the player appears', () => {
    expect(root().firstElementChild?.className).toContain('aspect-video');
    playButton().click();
    fixture.detectChanges();
    expect(root().firstElementChild?.className).toContain('aspect-video');
    httpMock.expectOne(ENDPOINT).flush({ manifestUrl: MANIFEST, expiresAtUtc: '2026-10-14T08:05:00Z' });
  });

  it('requests the playback URL only on click and shows a busy placeholder meanwhile', () => {
    playButton().click();
    fixture.detectChanges();

    expect(httpMock.expectOne(ENDPOINT).request.method).toBe('GET');
    expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(root().querySelector('video')).toBeNull();
  });

  it('mounts a native-controls video and hands it the signed manifest once granted', async () => {
    playButton().click();
    fixture.detectChanges();
    httpMock.expectOne(ENDPOINT).flush({ manifestUrl: MANIFEST, expiresAtUtc: '2026-10-14T08:05:00Z' });
    fixture.detectChanges();

    const video = root().querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.getAttribute('aria-label')).toBe('Intro video of Nina Tutor');
    expect(unavailable).not.toHaveBeenCalled();
    // The player code is imported lazily after the click; with no Media Source in jsdom it falls back to native playback.
    await vi.waitFor(() => expect(video?.getAttribute('src')).toBe(MANIFEST));
  });

  it.each([404, 503])('raises "unavailable" and shows no error when the server answers %s (the block is simply removed)', (status) => {
    playButton().click();
    fixture.detectChanges();
    httpMock.expectOne(ENDPOINT).flush({ title: 'x', reason: 'tutoring.intro_video_not_found' }, { status, statusText: 'x' });
    fixture.detectChanges();

    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(root().querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the card, explains, and lets the visitor retry on any other failure', () => {
    playButton().click();
    fixture.detectChanges();
    httpMock.expectOne(ENDPOINT).flush({ title: 'x' }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();

    expect(unavailable).not.toHaveBeenCalled();
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Too many requests');

    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Try again')!.click();
    fixture.detectChanges();
    httpMock.expectOne(ENDPOINT).flush({ manifestUrl: MANIFEST, expiresAtUtc: '2026-10-14T08:05:00Z' });
    fixture.detectChanges();
    expect(root().querySelector('video')).not.toBeNull();
  });

  it('ignores a response that arrives after the component is gone', () => {
    playButton().click();
    fixture.detectChanges();
    const pending = httpMock.expectOne(ENDPOINT);
    fixture.destroy();

    expect(pending.cancelled).toBe(true);
    expect(unavailable).not.toHaveBeenCalled();
  });
});
