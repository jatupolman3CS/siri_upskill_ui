import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VideoPlayer } from './video-player';
import { mapShakaPlaybackError } from './shaka-error-mapper';

describe('VideoPlayer Component', () => {
  let component: VideoPlayer;
  let fixture: ComponentFixture<VideoPlayer>;

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
    expect((component as any).formatTime(0)).toBe('00:00');
    expect((component as any).formatTime(65)).toBe('01:05');
    expect((component as any).formatTime(3665)).toBe('1:01:05');
    expect((component as any).formatTime(-1)).toBe('00:00');
  });

  it('should set playback rate and update signal', () => {
    const videoMock = { playbackRate: 1.0 } as HTMLVideoElement;
    (component as any).videoElementRef = { nativeElement: videoMock };

    component.setPlaybackRate(1.5);

    expect((component as any).playbackRate()).toBe(1.5);
    expect(videoMock.playbackRate).toBe(1.5);
  });

  it('should adjust volume and toggle mute correctly with memory', () => {
    const videoMock = { volume: 1.0, muted: false } as HTMLVideoElement;
    (component as any).videoElementRef = { nativeElement: videoMock };

    // Set to 0.7
    component.setVolume(0.7);
    expect((component as any).volume()).toBe(0.7);
    expect((component as any).isMuted()).toBe(false);

    // Toggle mute
    component.toggleMute();
    expect((component as any).isMuted()).toBe(true);
    expect(videoMock.muted).toBe(true);

    // Toggle unmute (should restore 0.7)
    component.toggleMute();
    expect((component as any).isMuted()).toBe(false);
    expect(videoMock.muted).toBe(false);
    expect((component as any).volume()).toBe(0.7);
  });

  it('should show resume prompt when initialPosition > 10', () => {
    component.initialPosition = 120;
    component.ngOnInit();

    expect((component as any).showResumePrompt()).toBe(true);
  });

  it('should seek to initialPosition on resumeFromSaved', () => {
    const videoMock = { currentTime: 0, play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement;
    (component as any).videoElementRef = { nativeElement: videoMock };
    component.initialPosition = 120;

    component.resumeFromSaved();

    expect((component as any).showResumePrompt()).toBe(false);
    expect(videoMock.currentTime).toBe(120);
    expect((component as any).isPlaying()).toBe(true);
  });

  it('should seek to 0 on startFromBeginning', () => {
    const videoMock = { currentTime: 100, play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement;
    (component as any).videoElementRef = { nativeElement: videoMock };

    component.startFromBeginning();

    expect((component as any).showResumePrompt()).toBe(false);
    expect(videoMock.currentTime).toBe(0);
    expect((component as any).isPlaying()).toBe(true);
  });

  it('should trigger free preview CTA modal when free preview ends', () => {
    component.isFreePreview = true;
    let endedEmitted = false;
    component.ended.subscribe(() => {
      endedEmitted = true;
    });

    (component as any).onVideoEnded();

    expect((component as any).showFreePreviewCta()).toBe(true);
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
    (component as any).videoElementRef = { nativeElement: videoMock };

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
    expect((component as any).volume()).toBeCloseTo(0.6);

    // 'm': Toggle Mute
    component.handleKeyboardEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect((component as any).isMuted()).toBe(true);

    // '5': Seek to 50%
    (component as any).duration.set(100);
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
    const loadSpy = vi.spyOn(component as any, 'loadMedia');
    component.src = 'https://video.example.com/manifest.mpd';
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
