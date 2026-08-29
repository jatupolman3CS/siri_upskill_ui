import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowClockwise,
  phosphorArrowCounterClockwise,
  phosphorArrowRight,
  phosphorArrowsClockwise,
  phosphorClosedCaptioning,
  phosphorCornersIn,
  phosphorCornersOut,
  phosphorGear,
  phosphorLock,
  phosphorPause,
  phosphorPictureInPicture,
  phosphorPlay,
  phosphorShoppingCart,
  phosphorSliders,
  phosphorSpeakerHigh,
  phosphorSpeakerLow,
  phosphorSpeakerSlash,
} from '@ng-icons/phosphor-icons/regular';
import shaka from 'shaka-player';

import { PlaybackWatermark } from '../data/learning-api.models';
import { PlaybackErrorInfo, mapShakaPlaybackError } from './shaka-error-mapper';

export interface QualityTrackOption {
  readonly id: number;
  readonly height: number;
  readonly width?: number | null;
  readonly bandwidth: number;
  readonly label: string;
}

export interface TextTrackOption {
  readonly id: number;
  readonly language: string;
  readonly label: string;
}

@Component({
  selector: 'app-video-player',
  imports: [CommonModule, NgIcon],
  templateUrl: './video-player.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorPlay,
      phosphorPause,
      phosphorSpeakerHigh,
      phosphorSpeakerLow,
      phosphorSpeakerSlash,
      phosphorCornersOut,
      phosphorCornersIn,
      phosphorArrowClockwise,
      phosphorArrowCounterClockwise,
      phosphorPictureInPicture,
      phosphorClosedCaptioning,
      phosphorGear,
      phosphorSliders,
      phosphorArrowsClockwise,
      phosphorShoppingCart,
      phosphorArrowRight,
      phosphorLock,
    }),
  ],
})
export class VideoPlayer implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('videoElement') videoElementRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('playerContainer') playerContainerRef?: ElementRef<HTMLDivElement>;

  @Input() src?: string;
  @Input() poster?: string | null;
  @Input() watermark?: PlaybackWatermark;
  @Input() initialPosition = 0;
  @Input() isFreePreview = false;
  @Input() courseTitle?: string;
  @Input() courseSlug?: string;

  @Output() readonly timeUpdate = new EventEmitter<number>();
  @Output() readonly ended = new EventEmitter<void>();
  @Output() readonly progressHeartbeat = new EventEmitter<number>();
  @Output() readonly buyCourseClicked = new EventEmitter<void>();

  // Player state signals
  protected readonly isPlaying = signal(false);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly volume = signal(1);
  protected readonly isMuted = signal(false);
  protected readonly isFullscreen = signal(false);
  protected readonly isPip = signal(false);
  protected readonly playbackRate = signal(1.0);
  protected readonly showControls = signal(true);
  protected readonly isBuffering = signal(false);

  // Menus & Modals
  protected readonly showSpeedMenu = signal(false);
  protected readonly showQualityMenu = signal(false);
  protected readonly showCaptionsMenu = signal(false);
  protected readonly showResumePrompt = signal(false);
  protected readonly showFreePreviewCta = signal(false);
  protected readonly playbackError = signal<PlaybackErrorInfo | null>(null);

  // Shaka Tracks
  protected readonly qualityOptions = signal<readonly QualityTrackOption[]>([]);
  protected readonly selectedQuality = signal<number | 'auto'>('auto');
  protected readonly textTrackOptions = signal<readonly TextTrackOption[]>([]);
  protected readonly isCaptionsEnabled = signal(false);
  protected readonly selectedTextTrack = signal<number | null>(null);

  // Watermark positioning (random every 8s)
  protected readonly watermarkTop = signal(20);
  protected readonly watermarkLeft = signal(30);

  // Constants
  readonly speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  private shakaPlayer: shaka.Player | null = null;
  private isViewInitialized = false;
  private isInitializingPlayer = false;
  private pendingMediaUrl: string | null = null;
  private heartbeatTimer?: number;
  private watermarkTimer?: number;
  private controlsTimeout?: number;
  private lastNonZeroVolume = 1;
  private isSeeking = false;

  ngOnInit(): void {
    if (this.initialPosition > 10) {
      this.showResumePrompt.set(true);
    }

    if (this.isBrowser) {
      this.setupTimers();
      this.initShakaPolyfills();
    }
  }

  ngAfterViewInit(): void {
    this.isViewInitialized = true;
    if (this.isBrowser && this.src) {
      this.loadMedia(this.src);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src'] && this.isBrowser && this.isViewInitialized) {
      const newSrc = changes['src'].currentValue;
      if (newSrc) {
        this.loadMedia(newSrc);
      }
    }
  }

  ngOnDestroy(): void {
    this.cleanupTimers();
    this.destroyShakaPlayer();
  }

  private initShakaPolyfills(): void {
    try {
      shaka.polyfill.installAll();
    } catch {
      // Ignore if already installed or unsupported
    }
  }

  private setupTimers(): void {
    // Watermark reposition every 8 seconds
    this.watermarkTimer = window.setInterval(() => {
      this.watermarkTop.set(Math.floor(Math.random() * 70) + 10);
      this.watermarkLeft.set(Math.floor(Math.random() * 65) + 10);
    }, 8000);

    // Heartbeat every 15 seconds while playing
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isPlaying()) {
        this.progressHeartbeat.emit(Math.floor(this.currentTime()));
      }
    }, 15000);
  }

  private cleanupTimers(): void {
    if (this.watermarkTimer) clearInterval(this.watermarkTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
  }

  public initPlayer(): void {
    if (!this.isBrowser || !this.videoElementRef) return;
    const videoEl = this.videoElementRef.nativeElement;

    if (!shaka.Player.isBrowserSupported()) {
      // Fallback to native video playback if browser does not support MSE/Shaka
      const directSrc = this.pendingMediaUrl || this.src;
      if (directSrc) {
        videoEl.src = directSrc;
      }
      return;
    }

    this.destroyShakaPlayer();
    this.isInitializingPlayer = true;

    const player = new shaka.Player();
    this.shakaPlayer = player;

    player.attach(videoEl).then(() => {
      this.isInitializingPlayer = false;
      player.configure({
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 2,
          bufferBehind: 30,
          retryParameters: {
            maxAttempts: 3,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5,
            timeout: 10000,
          },
        },
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 1000000,
        },
      });

      // Listen for Shaka events
      player.addEventListener('error', (event: unknown) => {
        const errorDetail = (event as { detail?: unknown }).detail || event;
        const mapped = mapShakaPlaybackError(errorDetail);
        this.playbackError.set(mapped);
        this.isPlaying.set(false);
      });

      player.addEventListener('buffering', (event: unknown) => {
        const isBuffering = (event as { buffering?: boolean }).buffering ?? false;
        this.isBuffering.set(isBuffering);
      });

      player.addEventListener('trackschanged', () => {
        this.updateAvailableTracks();
      });

      player.addEventListener('adaptation', () => {
        this.updateActiveTrack();
      });

      const urlToLoad = this.pendingMediaUrl || this.src;
      this.pendingMediaUrl = null;
      if (urlToLoad) {
        this.loadMedia(urlToLoad);
      }
    }).catch((err) => {
      this.isInitializingPlayer = false;
      this.playbackError.set(mapShakaPlaybackError(err));
    });
  }

  private loadMedia(url?: string): void {
    if (!url || !this.isBrowser) return;

    this.playbackError.set(null);
    this.showFreePreviewCta.set(false);

    if (!this.shakaPlayer || this.isInitializingPlayer) {
      this.pendingMediaUrl = url;
      if (!this.isInitializingPlayer) {
        this.initPlayer();
      }
      return;
    }

    this.shakaPlayer.load(url).then(() => {
      this.updateAvailableTracks();
      if (!this.showResumePrompt() && this.initialPosition > 0 && this.videoElementRef) {
        this.videoElementRef.nativeElement.currentTime = this.initialPosition;
      }
    }).catch((err) => {
      // If Shaka fails to parse manifest, try fallback native direct src if mp4
      if (url.endsWith('.mp4') && this.videoElementRef) {
        this.videoElementRef.nativeElement.src = url;
        this.videoElementRef.nativeElement.load();
      } else {
        this.playbackError.set(mapShakaPlaybackError(err));
      }
    });
  }

  private destroyShakaPlayer(): void {
    this.isInitializingPlayer = false;
    this.pendingMediaUrl = null;
    if (this.shakaPlayer) {
      this.shakaPlayer.destroy().catch(() => {});
      this.shakaPlayer = null;
    }
  }

  private updateAvailableTracks(): void {
    if (!this.shakaPlayer) return;

    // Quality / Variant tracks
    const variantTracks = this.shakaPlayer.getVariantTracks();
    const uniqueHeights = new Map<number, QualityTrackOption>();

    for (const track of variantTracks) {
      if (track.height && !uniqueHeights.has(track.height)) {
        uniqueHeights.set(track.height, {
          id: track.id,
          height: track.height,
          width: track.width,
          bandwidth: track.bandwidth,
          label: `${track.height}p`,
        });
      }
    }

    const sorted = Array.from(uniqueHeights.values()).sort((a, b) => b.height - a.height);
    this.qualityOptions.set(sorted);

    // Text / Subtitle tracks
    const textTracks = this.shakaPlayer.getTextTracks();
    const mappedTextTracks: TextTrackOption[] = textTracks.map((t) => ({
      id: t.id,
      language: t.language,
      label: t.label || t.language || 'คำบรรยาย',
    }));
    this.textTrackOptions.set(mappedTextTracks);
  }

  private updateActiveTrack(): void {
    if (!this.shakaPlayer) return;
    const config = this.shakaPlayer.getConfiguration();
    if (config.abr.enabled) {
      this.selectedQuality.set('auto');
    }
  }

  // --- Public / Protected Playback Controls ---

  public togglePlay(): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    if (this.playbackError()) {
      this.retryPlayback();
      return;
    }

    if (el.paused) {
      el.play().catch(() => {});
      this.isPlaying.set(true);
    } else {
      el.pause();
      this.isPlaying.set(false);
    }
  }

  public skip(seconds: number): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;
    const target = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
    el.currentTime = target;
    this.currentTime.set(target);
    this.showControlsForBriefly();
  }

  public toggleMute(): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    if (el.muted || el.volume === 0) {
      el.muted = false;
      el.volume = this.lastNonZeroVolume > 0 ? this.lastNonZeroVolume : 1;
      this.isMuted.set(false);
      this.volume.set(el.volume);
    } else {
      this.lastNonZeroVolume = el.volume;
      el.muted = true;
      this.isMuted.set(true);
      this.volume.set(0);
    }
    this.showControlsForBriefly();
  }

  public setVolume(vol: number): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    const clamped = Math.max(0, Math.min(1, vol));
    el.volume = clamped;
    this.volume.set(clamped);

    if (clamped === 0) {
      el.muted = true;
      this.isMuted.set(true);
    } else {
      el.muted = false;
      this.isMuted.set(false);
      this.lastNonZeroVolume = clamped;
    }
    this.showControlsForBriefly();
  }

  public setPlaybackRate(rate: number): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    el.playbackRate = rate;
    this.playbackRate.set(rate);
    this.showSpeedMenu.set(false);
    this.showControlsForBriefly();
  }

  public setQuality(quality: number | 'auto'): void {
    if (!this.shakaPlayer) return;

    if (quality === 'auto') {
      this.shakaPlayer.configure({ abr: { enabled: true } });
      this.selectedQuality.set('auto');
    } else {
      this.shakaPlayer.configure({ abr: { enabled: false } });
      const tracks = this.shakaPlayer.getVariantTracks().filter((t) => t.height === quality);
      if (tracks.length > 0) {
        this.shakaPlayer.selectVariantTrack(tracks[0], false);
      }
      this.selectedQuality.set(quality);
    }

    this.showQualityMenu.set(false);
    this.showControlsForBriefly();
  }

  public toggleCaptions(): void {
    if (!this.shakaPlayer) return;

    if (this.isCaptionsEnabled()) {
      this.shakaPlayer.selectTextTrack(null);
      this.isCaptionsEnabled.set(false);
      this.selectedTextTrack.set(null);
    } else {
      const tracks = this.shakaPlayer.getTextTracks();
      if (tracks.length > 0) {
        this.shakaPlayer.selectTextTrack(tracks[0]);
        this.isCaptionsEnabled.set(true);
        this.selectedTextTrack.set(tracks[0].id);
      }
    }

    this.showCaptionsMenu.set(false);
    this.showControlsForBriefly();
  }

  public selectCaptionTrack(trackId: number): void {
    if (!this.shakaPlayer) return;
    const tracks = this.shakaPlayer.getTextTracks().filter((t) => t.id === trackId);
    if (tracks.length > 0) {
      this.shakaPlayer.selectTextTrack(tracks[0]);
      this.isCaptionsEnabled.set(true);
      this.selectedTextTrack.set(trackId);
    }
    this.showCaptionsMenu.set(false);
  }

  public toggleFullscreen(): void {
    const container = this.playerContainerRef?.nativeElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => this.isFullscreen.set(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => this.isFullscreen.set(false)).catch(() => {});
    }
  }

  public togglePip(): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el || !('pictureInPictureEnabled' in document)) return;

    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().then(() => this.isPip.set(false)).catch(() => {});
    } else {
      el.requestPictureInPicture().then(() => this.isPip.set(true)).catch(() => {});
    }
  }

  public retryPlayback(): void {
    this.playbackError.set(null);
    if (this.src) {
      this.loadMedia(this.src);
    }
  }

  public resumeFromSaved(): void {
    this.showResumePrompt.set(false);
    const el = this.videoElementRef?.nativeElement;
    if (el) {
      el.currentTime = this.initialPosition;
      el.play().catch(() => {});
      this.isPlaying.set(true);
    }
  }

  public startFromBeginning(): void {
    this.showResumePrompt.set(false);
    const el = this.videoElementRef?.nativeElement;
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => {});
      this.isPlaying.set(true);
    }
  }

  public onBuyCourseClick(): void {
    this.buyCourseClicked.emit();
  }

  // --- Keyboard Shortcuts (A11y) ---

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    // Ignore if target is an interactive form input
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    switch (event.key) {
      case ' ':
      case 'k':
      case 'K':
        event.preventDefault();
        this.togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.skip(-5);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.skip(5);
        break;
      case 'j':
      case 'J':
        event.preventDefault();
        this.skip(-10);
        break;
      case 'l':
      case 'L':
        event.preventDefault();
        this.skip(10);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.setVolume(this.volume() + 0.1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.setVolume(this.volume() - 0.1);
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        this.toggleFullscreen();
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        this.toggleMute();
        break;
      case 'c':
      case 'C':
        event.preventDefault();
        this.toggleCaptions();
        break;
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9': {
        const percent = Number(event.key) / 10;
        const dur = this.duration();
        if (dur > 0 && this.videoElementRef) {
          event.preventDefault();
          this.videoElementRef.nativeElement.currentTime = dur * percent;
          this.currentTime.set(dur * percent);
        }
        break;
      }
    }
  }

  // --- Video Element Event Handlers ---

  protected onTimeUpdated(): void {
    if (this.isSeeking) return;
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    this.currentTime.set(el.currentTime);
    this.timeUpdate.emit(el.currentTime);
  }

  protected onLoadedMetadata(): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    this.duration.set(el.duration);
    if (!this.showResumePrompt() && this.initialPosition > 0) {
      el.currentTime = this.initialPosition;
    }
  }

  protected onVideoEnded(): void {
    this.isPlaying.set(false);
    this.progressHeartbeat.emit(Math.floor(this.duration()));

    if (this.isFreePreview) {
      this.showFreePreviewCta.set(true);
    }

    this.ended.emit();
  }

  protected onNativeError(event: Event): void {
    this.playbackError.set(mapShakaPlaybackError(event));
    this.isPlaying.set(false);
  }

  protected onSeekInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const seekTo = Number(target.value);
    this.currentTime.set(seekTo);
  }

  protected onSeekChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const seekTo = Number(target.value);
    const el = this.videoElementRef?.nativeElement;
    if (el) {
      el.currentTime = seekTo;
      this.currentTime.set(seekTo);
    }
    this.isSeeking = false;
  }

  protected onVolumeInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.setVolume(Number(target.value));
  }

  protected onMouseMove(): void {
    this.showControlsForBriefly();
  }

  private showControlsForBriefly(): void {
    this.showControls.set(true);
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    this.controlsTimeout = window.setTimeout(() => {
      if (this.isPlaying()) {
        this.showControls.set(false);
        this.showSpeedMenu.set(false);
        this.showQualityMenu.set(false);
        this.showCaptionsMenu.set(false);
      }
    }, 3500);
  }

  protected formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
