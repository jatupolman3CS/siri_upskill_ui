import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowClockwise,
  phosphorArrowCounterClockwise,
  phosphorCornersIn,
  phosphorCornersOut,
  phosphorPause,
  phosphorPlay,
  phosphorSpeakerHigh,
  phosphorSpeakerSlash,
} from '@ng-icons/phosphor-icons/regular';

import { PlaybackWatermark } from '../data/learning-api.models';

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
      phosphorSpeakerSlash,
      phosphorCornersOut,
      phosphorCornersIn,
      phosphorArrowClockwise,
      phosphorArrowCounterClockwise,
    }),
  ],
})
export class VideoPlayer implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElementRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('playerContainer') playerContainerRef?: ElementRef<HTMLDivElement>;

  @Input() src?: string;
  @Input() poster?: string | null;
  @Input() watermark?: PlaybackWatermark;
  @Input() initialPosition = 0;
  @Input() isFreePreview = false;

  @Output() readonly timeUpdate = new EventEmitter<number>();
  @Output() readonly ended = new EventEmitter<void>();
  @Output() readonly progressHeartbeat = new EventEmitter<number>();

  protected readonly isPlaying = signal(false);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly volume = signal(1);
  protected readonly isMuted = signal(false);
  protected readonly isFullscreen = signal(false);
  protected readonly playbackRate = signal(1.0);
  protected readonly showControls = signal(true);
  protected readonly showSpeedMenu = signal(false);

  // Watermark coordinates (floating randomly every 8s)
  protected readonly watermarkTop = signal(20);
  protected readonly watermarkLeft = signal(30);

  // Resume prompt
  protected readonly showResumePrompt = signal(false);

  private heartbeatTimer?: number;
  private watermarkTimer?: number;
  private controlsTimeout?: number;

  readonly speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  ngOnInit(): void {
    if (this.initialPosition > 10) {
      this.showResumePrompt.set(true);
    }

    // Floating watermark timer every 8s
    this.watermarkTimer = window.setInterval(() => {
      this.watermarkTop.set(Math.floor(Math.random() * 70) + 10);
      this.watermarkLeft.set(Math.floor(Math.random() * 65) + 10);
    }, 8000);

    // Heartbeat every 15s when playing
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isPlaying()) {
        this.progressHeartbeat.emit(Math.floor(this.currentTime()));
      }
    }, 15000);
  }

  ngOnDestroy(): void {
    if (this.watermarkTimer) clearInterval(this.watermarkTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
  }

  protected togglePlay(): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    if (el.paused) {
      el.play().catch(() => {});
      this.isPlaying.set(true);
    } else {
      el.pause();
      this.isPlaying.set(false);
    }
  }

  protected onTimeUpdated(): void {
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
    this.ended.emit();
  }

  protected onSeek(event: Event): void {
    const target = event.target as HTMLInputElement;
    const seekTo = Number(target.value);
    const el = this.videoElementRef?.nativeElement;
    if (el) {
      el.currentTime = seekTo;
      this.currentTime.set(seekTo);
    }
  }

  protected skip(seconds: number): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
  }

  protected toggleMute(): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    el.muted = !el.muted;
    this.isMuted.set(el.muted);
  }

  protected onVolumeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const vol = Number(target.value);
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    el.volume = vol;
    this.volume.set(vol);
    if (vol === 0) {
      el.muted = true;
      this.isMuted.set(true);
    } else if (this.isMuted()) {
      el.muted = false;
      this.isMuted.set(false);
    }
  }

  protected setPlaybackRate(rate: number): void {
    const el = this.videoElementRef?.nativeElement;
    if (!el) return;

    el.playbackRate = rate;
    this.playbackRate.set(rate);
    this.showSpeedMenu.set(false);
  }

  protected toggleFullscreen(): void {
    const container = this.playerContainerRef?.nativeElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => this.isFullscreen.set(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => this.isFullscreen.set(false)).catch(() => {});
    }
  }

  protected resumeFromSaved(): void {
    this.showResumePrompt.set(false);
    const el = this.videoElementRef?.nativeElement;
    if (el) {
      el.currentTime = this.initialPosition;
      el.play().catch(() => {});
      this.isPlaying.set(true);
    }
  }

  protected startFromBeginning(): void {
    this.showResumePrompt.set(false);
    const el = this.videoElementRef?.nativeElement;
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => {});
      this.isPlaying.set(true);
    }
  }

  protected formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  protected onMouseMove(): void {
    this.showControls.set(true);
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    this.controlsTimeout = window.setTimeout(() => {
      if (this.isPlaying()) {
        this.showControls.set(false);
        this.showSpeedMenu.set(false);
      }
    }, 3500);
  }
}
