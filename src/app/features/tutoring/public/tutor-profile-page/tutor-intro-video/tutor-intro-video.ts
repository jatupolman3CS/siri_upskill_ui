import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPlay } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { DurationPipe } from '../../../../../core/i18n/duration.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';

type IntroVideoState = 'idle' | 'loading' | 'playing' | 'error';

/** Minimal slice of Shaka's player used here (the full type lives in the lazily loaded chunk). */
interface ShakaPlayerLike {
  attach(video: HTMLVideoElement): Promise<void>;
  load(url: string): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Tutor intro video (P13-21). A poster-style play card that costs nothing until pressed: the signed manifest is requested
 * only on click (it is short-lived, `Cache-Control: no-store`, and each request is a real playback URL), and the player
 * code (Shaka) is imported lazily at that moment, so none of it weighs on the profile page or its SSR render.
 * <para>
 * The box keeps a fixed 16:9 footprint in every state, so nothing shifts when it swaps from the play card to the player.
 * `404` / `503` from the endpoint mean "no public video right now" (not ready, provider down, or never available for this
 * tutor) - the component raises `unavailable` and the page removes the whole block instead of showing an error for
 * something the visitor never asked for. Any other failure keeps the card and offers a retry. The contract flags that
 * playback from this origin is not yet proven against the video provider's embed-only mode (Open decision #3), so this
 * graceful path is load-bearing, not decoration.
 * </para>
 * Playback starts via `autoplay` inside the user's click gesture; native controls are used (no custom chrome). The intro
 * clip carries no caption track in the contract, so there is nothing to attach.
 */
@Component({
  selector: 'app-tutor-intro-video',
  imports: [NgIcon, TranslatePipe, DurationPipe, Button, Skeleton],
  templateUrl: './tutor-intro-video.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorPlay })],
  host: { class: 'block' },
})
export class TutorIntroVideo {
  readonly slug = input.required<string>();
  readonly displayName = input.required<string>();
  readonly durationSeconds = input.required<number>();
  /** Raised when the server says there is no public video (404/503); the parent hides this block. */
  readonly unavailable = output<void>();

  private readonly api = inject(TutoringPublicApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<IntroVideoState>('idle');
  protected readonly errorKey = signal('tutoring.errors.generic');
  protected readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly manifestUrl = signal<string | null>(null);
  private player: ShakaPlayerLike | null = null;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      void this.player?.destroy().catch(() => undefined);
      this.player = null;
    });

    // The <video> element only exists once the state is 'playing'; wire the stream as soon as both it and the URL are there.
    effect(() => {
      const video = this.videoRef()?.nativeElement;
      const url = this.manifestUrl();
      if (video && url) {
        untracked(() => void this.attach(video, url));
      }
    });
  }

  protected play(): void {
    this.state.set('loading');
    this.api
      .getIntroVideo(this.slug())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (playback) => {
          this.manifestUrl.set(playback.manifestUrl);
          this.state.set('playing');
        },
        error: (error: unknown) => {
          if (error instanceof ApiError && (error.status === 404 || error.status === 503)) {
            this.unavailable.emit();
            return;
          }
          this.errorKey.set(tutoringErrorKey(error));
          this.state.set('error');
        },
      });
  }

  private async attach(video: HTMLVideoElement, url: string): Promise<void> {
    try {
      const shaka = (await import('shaka-player')).default;
      if (this.destroyed) {
        return;
      }
      shaka.polyfill.installAll();
      if (shaka.Player.isBrowserSupported()) {
        const player: ShakaPlayerLike = new shaka.Player();
        this.player = player;
        await player.attach(video);
        await player.load(url);
      } else {
        // No MSE (e.g. iOS Safari): the platform plays HLS natively.
        video.src = url;
      }
    } catch {
      if (!this.destroyed) {
        this.errorKey.set('tutoring.errors.generic');
        this.state.set('error');
      }
    }
  }
}
