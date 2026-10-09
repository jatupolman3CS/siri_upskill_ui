import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VideoPlayer } from './video-player';
import { mapShakaPlaybackError } from './shaka-error-mapper';
import { AuthPrefixRewrite, PLAYBACK_RENEWAL_MARGIN_MS } from './playback-url-renewal';

/**
 * `VideoPlayer`'s `videoElementRef`/`playerContainerRef` are `viewChild()` signals and its state
 * (playbackRate, volume, isMuted, ...) are `protected` signals — none of these are part of the
 * component's public API, but these tests need to seed/read them directly rather than driving a
 * real (and in jsdom, unimplemented) `<video>` element end-to-end. `unknown` + this shape (this
 * codebase's established pattern — see courses-page.spec.ts/checkout-page.spec.ts) keeps that
 * typed instead of reaching for `any`. `videoElementRef` is reassigned outright to a plain
 * closure (rather than calling `.set()` on it) because `viewChild()`'s real Signal has no public
 * setter — tests replace the whole property with a fake accessor instead.
 */
interface VideoPlayerInternals {
  videoElementRef: () => { readonly nativeElement: HTMLVideoElement } | undefined;
  formatTime(seconds: number): string;
  onVideoEnded(): void;
  loadMedia(url?: string): void;
  readonly playbackRate: WritableSignal<number>;
  readonly volume: WritableSignal<number>;
  readonly isMuted: WritableSignal<boolean>;
  readonly isPlaying: WritableSignal<boolean>;
  readonly duration: WritableSignal<number>;
  readonly showResumePrompt: WritableSignal<boolean>;
  readonly showFreePreviewCta: WritableSignal<boolean>;
  readonly playbackError: WritableSignal<{ readonly title: string; readonly message: string } | null>;
  readonly originalManifestUrl: string | null;
  readonly authPrefixRewrite: AuthPrefixRewrite | null;
  readonly renewalVersion: number;
}

function internals(component: VideoPlayer): VideoPlayerInternals {
  return component as unknown as VideoPlayerInternals;
}

describe('VideoPlayer Component', () => {
  let fixture: ComponentFixture<VideoPlayer>;
  let component: VideoPlayer;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VideoPlayer],
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayer);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('should create the video player component', () => {
    expect(component).toBeTruthy();
  });

  it('draws the server-built watermarkPayload (a long Thai + email string) in the watermark overlay', () => {
    const payload =
      'สมชาย ใจดีมากมายเหลือเกิน · somchai.jaidee.verylongaddress@example-university.ac.th · 2026-10-09 02:37:59 UTC';
    fixture.componentRef.setInput('watermarkPayload', payload);

    fixture.detectChanges();

    const overlay = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="playback-watermark"]');
    expect(overlay?.textContent?.trim()).toBe(payload);
  });

  it('falls back to the legacy structured watermark when no payload is given, and draws nothing when there is neither', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="playback-watermark"]')).toBeNull();

    fixture.componentRef.setInput('watermark', {
      text: 'Somchai',
      userId: 'u1',
      email: 'somchai@example.com',
      timestamp: '2026-10-09T02:37:59Z',
    });
    fixture.detectChanges();

    const overlay = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="playback-watermark"]');
    expect(overlay?.textContent?.trim()).toBe('Somchai · somchai@example.com');
  });

  it('should format seconds into mm:ss or hh:mm:ss correctly', () => {
    expect(internals(component).formatTime(0)).toBe('00:00');
    expect(internals(component).formatTime(65)).toBe('01:05');
    expect(internals(component).formatTime(3665)).toBe('1:01:05');
    expect(internals(component).formatTime(-1)).toBe('00:00');
  });

  it('should set playback rate and update signal', () => {
    const videoMock = { playbackRate: 1.0 } as HTMLVideoElement;
    internals(component).videoElementRef = () => ({ nativeElement: videoMock });

    component.setPlaybackRate(1.5);

    expect(internals(component).playbackRate()).toBe(1.5);
    expect(videoMock.playbackRate).toBe(1.5);
  });

  it('should adjust volume and toggle mute correctly with memory', () => {
    const videoMock = { volume: 1.0, muted: false } as HTMLVideoElement;
    internals(component).videoElementRef = () => ({ nativeElement: videoMock });

    // Set to 0.7
    component.setVolume(0.7);
    expect(internals(component).volume()).toBe(0.7);
    expect(internals(component).isMuted()).toBe(false);

    // Toggle mute
    component.toggleMute();
    expect(internals(component).isMuted()).toBe(true);
    expect(videoMock.muted).toBe(true);

    // Toggle unmute (should restore 0.7)
    component.toggleMute();
    expect(internals(component).isMuted()).toBe(false);
    expect(videoMock.muted).toBe(false);
    expect(internals(component).volume()).toBe(0.7);
  });

  it('should show resume prompt when initialPosition > 10', () => {
    fixture.componentRef.setInput('initialPosition', 120);
    component.ngOnInit();

    expect(internals(component).showResumePrompt()).toBe(true);
  });

  it('should seek to initialPosition on resumeFromSaved', () => {
    const videoMock = { currentTime: 0, play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement;
    internals(component).videoElementRef = () => ({ nativeElement: videoMock });
    fixture.componentRef.setInput('initialPosition', 120);

    component.resumeFromSaved();

    expect(internals(component).showResumePrompt()).toBe(false);
    expect(videoMock.currentTime).toBe(120);
    expect(internals(component).isPlaying()).toBe(true);
  });

  it('should seek to 0 on startFromBeginning', () => {
    const videoMock = { currentTime: 100, play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement;
    internals(component).videoElementRef = () => ({ nativeElement: videoMock });

    component.startFromBeginning();

    expect(internals(component).showResumePrompt()).toBe(false);
    expect(videoMock.currentTime).toBe(0);
    expect(internals(component).isPlaying()).toBe(true);
  });

  it('should trigger free preview CTA modal when free preview ends', () => {
    fixture.componentRef.setInput('isFreePreview', true);
    let endedEmitted = false;
    component.videoEnded.subscribe(() => {
      endedEmitted = true;
    });

    internals(component).onVideoEnded();

    expect(internals(component).showFreePreviewCta()).toBe(true);
    expect(endedEmitted).toBe(true);
  });

  it('should emit buyCourseClicked when CTA buy button is clicked', () => {
    let buyEmitted = false;
    component.buyCourseClicked.subscribe(() => {
      buyEmitted = true;
    });

    component.onBuyCourseClick();

    expect(buyEmitted).toBe(true);
  });

  it('should handle keyboard shortcuts for play/pause, volume, and seeking', () => {
    const videoMock = {
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      volume: 0.5,
      muted: false,
      currentTime: 20,
      duration: 100,
    } as unknown as HTMLVideoElement;
    internals(component).videoElementRef = () => ({ nativeElement: videoMock });

    // Space key: Play
    component.handleKeyboardEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(videoMock.play).toHaveBeenCalled();

    // ArrowRight: Skip +5
    component.handleKeyboardEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(videoMock.currentTime).toBe(25);

    // ArrowLeft: Skip -5
    component.handleKeyboardEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(videoMock.currentTime).toBe(20);

    // ArrowUp: Volume +0.1 (from 0.5)
    component.setVolume(0.5);
    component.handleKeyboardEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(internals(component).volume()).toBeCloseTo(0.6);

    // 'm': Toggle Mute
    component.handleKeyboardEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(internals(component).isMuted()).toBe(true);

    // '5': Seek to 50%
    internals(component).duration.set(100);
    component.handleKeyboardEvent(new KeyboardEvent('keydown', { key: '5' }));
    expect(videoMock.currentTime).toBe(50);
  });

  it('should not handle keyboard shortcuts when user is typing in an input element', () => {
    const inputEl = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: ' ' });
    Object.defineProperty(event, 'target', { value: inputEl });

    const togglePlaySpy = vi.spyOn(component, 'togglePlay');
    component.handleKeyboardEvent(event);

    expect(togglePlaySpy).not.toHaveBeenCalled();
  });

  it('should load media on ngAfterViewInit when src is provided', () => {
    const loadSpy = vi.spyOn(internals(component), 'loadMedia');
    fixture.componentRef.setInput('src', 'https://video.example.com/manifest.mpd');
    component.ngAfterViewInit();

    expect(loadSpy).toHaveBeenCalledWith('https://video.example.com/manifest.mpd');
  });

  describe('X-28: proactive playback-URL renewal', () => {
    const originalUrl =
      'https://cdn.example.com/bcdn_token=OLD&expires=1000&token_path=%2Fep-1%2F/ep-1/playlist.m3u8';

    function primeEpisode(now: number, ttlMs = 5 * 60_000): void {
      fixture.componentRef.setInput('src', originalUrl);
      fixture.componentRef.setInput('episodeId', 'episode-1');
      fixture.componentRef.setInput('expiresAtUtc', new Date(now + ttlMs).toISOString());
    }

    it('fires a renewal call before expiry and swaps the auth prefix without a full reload', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      primeEpisode(now);
      const loadMediaSpy = vi.spyOn(internals(component), 'loadMedia');

      component.ngAfterViewInit();

      // Not yet due — well before the renewal margin kicks in ahead of the 5-minute expiry.
      await vi.advanceTimersByTimeAsync(60_000);
      httpMock.expectNone('/api/media/playback/episode-1');

      // Past the renewal margin ahead of expiry — the renewal call fires.
      await vi.advanceTimersByTimeAsync(5 * 60_000 - PLAYBACK_RENEWAL_MARGIN_MS - 60_000);
      const req = httpMock.expectOne('/api/media/playback/episode-1');
      expect(req.request.method).toBe('GET');

      const freshUrl =
        'https://cdn.example.com/bcdn_token=NEW&expires=2000&token_path=%2Fep-1%2F/ep-1/playlist.m3u8';
      req.flush({ manifestUrl: freshUrl, expiresAtUtc: new Date(now + 10 * 60_000).toISOString() });

      expect(internals(component).authPrefixRewrite).toEqual({
        oldPrefix: 'https://cdn.example.com/bcdn_token=OLD&expires=1000',
        newPrefix: 'https://cdn.example.com/bcdn_token=NEW&expires=2000',
      });
      // The renewal never reloads via the fresh URL — position/state-preserving prefix swap only,
      // not a `player.load()` of the newly issued manifest (which would restart playback).
      expect(loadMediaSpy).not.toHaveBeenCalledWith(freshUrl);
      expect(internals(component).playbackError()).toBeNull();
    });

    it('reschedules another renewal after a successful one, using the freshly returned expiry', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      primeEpisode(now);
      component.ngAfterViewInit();

      await vi.advanceTimersByTimeAsync(5 * 60_000 - PLAYBACK_RENEWAL_MARGIN_MS);
      httpMock
        .expectOne('/api/media/playback/episode-1')
        .flush({ manifestUrl: originalUrl, expiresAtUtc: new Date(Date.now() + 5 * 60_000).toISOString() });

      // A second renewal fires 5 more minutes later (minus the margin) — the schedule didn't stop.
      await vi.advanceTimersByTimeAsync(5 * 60_000 - PLAYBACK_RENEWAL_MARGIN_MS - 1);
      httpMock.expectNone('/api/media/playback/episode-1');
      await vi.advanceTimersByTimeAsync(1);
      httpMock.expectOne('/api/media/playback/episode-1').flush({
        manifestUrl: originalUrl,
        expiresAtUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    });

    it('does not leak the renewal timer after the component is destroyed', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      primeEpisode(now);
      component.ngAfterViewInit();

      fixture.destroy();

      await vi.advanceTimersByTimeAsync(10 * 60_000);
      httpMock.expectNone('/api/media/playback/episode-1');
    });

    it('surfaces the error overlay and stops the renewal loop when a renewal request fails', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      primeEpisode(now);
      component.ngAfterViewInit();

      await vi.advanceTimersByTimeAsync(5 * 60_000 - PLAYBACK_RENEWAL_MARGIN_MS);
      httpMock.expectOne('/api/media/playback/episode-1').flush(null, { status: 403, statusText: 'Forbidden' });

      const error = internals(component).playbackError();
      expect(error).not.toBeNull();
      expect(error?.title).toContain('สิทธิ์การรับชม');

      // No further renewal is attempted automatically — the learner must retry manually.
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      httpMock.expectNone('/api/media/playback/episode-1');
    });

    it('retries once after a transient renewal failure without interrupting playback, then succeeds', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      primeEpisode(now);
      component.ngAfterViewInit();

      await vi.advanceTimersByTimeAsync(5 * 60_000 - PLAYBACK_RENEWAL_MARGIN_MS);
      httpMock.expectOne('/api/media/playback/episode-1').flush(null, { status: 0, statusText: 'Unknown Error' });

      // A single transient failure (network blip, 5xx — not a revoked entitlement) must not
      // interrupt playback with the blocking error overlay.
      expect(internals(component).playbackError()).toBeNull();

      // The retry fires almost immediately — computeRenewalDelayMs()'s floor kicks in because
      // it's re-armed against the same (already-past-margin) expiresAtUtc — rather than the timer
      // permanently giving up after just one failure.
      await vi.advanceTimersByTimeAsync(1_000);
      const freshUrl =
        'https://cdn.example.com/bcdn_token=NEW&expires=2000&token_path=%2Fep-1%2F/ep-1/playlist.m3u8';
      httpMock
        .expectOne('/api/media/playback/episode-1')
        .flush({ manifestUrl: freshUrl, expiresAtUtc: new Date(Date.now() + 5 * 60_000).toISOString() });

      expect(internals(component).playbackError()).toBeNull();
      expect(internals(component).authPrefixRewrite).toEqual({
        oldPrefix: 'https://cdn.example.com/bcdn_token=OLD&expires=1000',
        newPrefix: 'https://cdn.example.com/bcdn_token=NEW&expires=2000',
      });
    });

    it('gives up and surfaces the error overlay after a second consecutive transient failure', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      primeEpisode(now);
      component.ngAfterViewInit();

      await vi.advanceTimersByTimeAsync(5 * 60_000 - PLAYBACK_RENEWAL_MARGIN_MS);
      httpMock.expectOne('/api/media/playback/episode-1').flush(null, { status: 0, statusText: 'Unknown Error' });
      expect(internals(component).playbackError()).toBeNull();

      await vi.advanceTimersByTimeAsync(1_000);
      httpMock.expectOne('/api/media/playback/episode-1').flush(null, { status: 0, statusText: 'Unknown Error' });

      expect(internals(component).playbackError()).not.toBeNull();

      // No third attempt — the retry budget (one) is spent, so the timer gives up for good.
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      httpMock.expectNone('/api/media/playback/episode-1');
    });
  });
});

describe('mapShakaPlaybackError', () => {
  it('should map DRM license failure (category 6, code 6007/6008) to user-friendly message', () => {
    const error = { category: 6, code: 6007 };
    const mapped = mapShakaPlaybackError(error);

    expect(mapped.title).toContain('สิทธิ์การรับชมหมดอายุ');
    expect(mapped.isRecoverable).toBe(true);
  });

  it('should map network HTTP errors (category 1, code 1002) correctly', () => {
    const error = { category: 1, code: 1002 };
    const mapped = mapShakaPlaybackError(error);

    expect(mapped.title).toContain('เซิร์ฟเวอร์วิดีโอไม่ตอบสนอง');
  });

  it('should map general network errors (category 1) to internet connection prompt', () => {
    const error = { category: 1, code: 1001 };
    const mapped = mapShakaPlaybackError(error);

    expect(mapped.title).toContain('ปัญหาการเชื่อมต่ออินเทอร์เน็ต');
  });

  it('should map media decode errors (category 3)', () => {
    const error = { category: 3, code: 3016 };
    const mapped = mapShakaPlaybackError(error);

    expect(mapped.title).toContain('การถอดรหัสวิดีโอ');
  });

  it('should map manifest errors (category 4)', () => {
    const error = { category: 4, code: 4001 };
    const mapped = mapShakaPlaybackError(error);

    expect(mapped.title).toContain('ไม่สามารถโหลดโครงสร้างวิดีโอ');
  });

  it('should return fallback message on null or unknown errors', () => {
    const mapped = mapShakaPlaybackError(null);
    expect(mapped.title).toContain('เกิดข้อผิดพลาดในการเล่นวิดีโอ');
    expect(mapped.isRecoverable).toBe(true);
  });
});
