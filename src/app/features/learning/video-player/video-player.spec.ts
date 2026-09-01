import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VideoPlayer } from './video-player';
import { mapShakaPlaybackError } from './shaka-error-mapper';

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
}

function internals(component: VideoPlayer): VideoPlayerInternals {
  return component as unknown as VideoPlayerInternals;
}

describe('VideoPlayer Component', () => {
  let fixture: ComponentFixture<VideoPlayer>;
  let component: VideoPlayer;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VideoPlayer],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayer);
    component = fixture.componentInstance;
  });

  it('should create the video player component', () => {
    expect(component).toBeTruthy();
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
