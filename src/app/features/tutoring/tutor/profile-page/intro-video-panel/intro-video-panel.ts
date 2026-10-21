import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorTrash, phosphorUploadSimple, phosphorVideoCamera } from '@ng-icons/phosphor-icons/regular';
import { Observable, Subscription, filter, last, of, switchMap, take, tap, throwError } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import type { MediaAssetResponse } from '../../../../media/data/media-api.models';
import { MediaApiService } from '../../../../media/data/media-api.service';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutoringTutorApiService } from '../../../data/tutoring-tutor-api.service';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

type Stage = 'idle' | 'uploading' | 'processing' | 'linking' | 'failed';

/**
 * Intro video of the tutor profile. The upload itself is the platform's normal media pipeline (`MediaApiService`: create
 * asset -> resumable upload -> complete -> wait until `Ready`); this panel only drives it and then links the finished asset
 * to the profile (`PUT tutor/profile/intro-video`). The server insists the asset is the caller's own, `Ready`, and 5-180
 * seconds long; a retry of just the link step does not upload the file again.
 */
@Component({
  selector: 'app-tutor-intro-video-panel',
  imports: [NgIcon, TranslatePipe, Button, TutorProblem],
  templateUrl: './intro-video-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorTrash, phosphorUploadSimple, phosphorVideoCamera })],
})
export class IntroVideoPanel {
  private readonly media = inject(MediaApiService);
  private readonly api = inject(TutoringTutorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly hasVideo = input(false);
  readonly disabled = input(false);
  /** The link changed on the server (set or removed); the owner page refreshes the profile. */
  readonly changed = output<void>();

  protected readonly stage = signal<Stage>('idle');
  protected readonly percent = signal(0);
  private readonly errorKey = signal<string | null>(null);
  /** Set once the asset is `Ready`, so a failed link can be retried without uploading the file again. */
  private readonly readyAssetId = signal<string | null>(null);
  private subscription: Subscription | null = null;

  protected readonly busy = computed(() => ['uploading', 'processing', 'linking'].includes(this.stage()));
  protected readonly canRetryLink = computed(() => this.stage() === 'failed' && this.readyAssetId() !== null);
  protected readonly problem = computed(() => {
    const key = this.errorKey();
    return key === null ? null : this.i18n.t(key);
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.subscription?.unsubscribe());
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (file === null || this.busy() || this.disabled()) {
      return;
    }
    const invalid = this.media.validateVideoFile(file);
    if (invalid) {
      this.fail(invalid);
      return;
    }
    this.begin('uploading');
    this.readyAssetId.set(null);
    this.percent.set(0);
    this.subscription?.unsubscribe();
    this.subscription = this.uploadAndWait(file)
      .pipe(switchMap((asset) => this.requireReady(asset)))
      .subscribe({
        next: (assetId) => this.link(assetId),
        error: (error: unknown) => this.fail(this.uploadErrorKey(error)),
      });
  }

  protected retryLink(): void {
    const assetId = this.readyAssetId();
    if (assetId && !this.busy()) {
      this.link(assetId);
    }
  }

  protected remove(): void {
    if (this.busy() || this.disabled()) {
      return;
    }
    this.begin('linking');
    this.api.clearIntroVideo().subscribe({
      next: () => {
        this.stage.set('idle');
        this.toast.success(this.i18n.t('tutoring.tutor.video.removed'));
        this.changed.emit();
      },
      error: (error: unknown) => this.fail(tutoringErrorKey(error)),
    });
  }

  private uploadAndWait(file: File): Observable<MediaAssetResponse> {
    return this.media.createAsset({ title: this.i18n.t('tutoring.tutor.video.assetTitle') }).pipe(
      switchMap((asset) =>
        this.media.createUploadSession(asset.id).pipe(
          switchMap((session) =>
            this.media.uploadVideoFile(session.uploadUrl, file).pipe(
              tap((event) => this.percent.set(event.progress)),
              filter((event) => event.isComplete),
              take(1),
              switchMap(() => this.media.completeUploadSession(session.id)),
            ),
          ),
          tap(() => this.stage.set('processing')),
          // `watchAsset` polls until the asset leaves Uploading/Processing and emits the final state last.
          switchMap(() => this.media.watchAsset(asset.id)),
          last(),
        ),
      ),
    );
  }

  private requireReady(asset: MediaAssetResponse): Observable<string> {
    return asset.status === 'Ready' ? of(asset.id) : throwError(() => new Error('instructor.builder.upload.processingFailed'));
  }

  private link(mediaAssetId: string): void {
    this.begin('linking');
    this.readyAssetId.set(mediaAssetId);
    this.api.setIntroVideo({ mediaAssetId }).subscribe({
      next: () => {
        this.stage.set('idle');
        this.readyAssetId.set(null);
        this.toast.success(this.i18n.t('tutoring.tutor.video.linked'));
        this.changed.emit();
      },
      error: (error: unknown) => this.fail(tutoringErrorKey(error)),
    });
  }

  private begin(stage: Stage): void {
    this.stage.set(stage);
    this.errorKey.set(null);
  }

  private fail(key: string): void {
    this.stage.set('failed');
    this.errorKey.set(key);
  }

  /** Only our own i18n keys (or the generic transfer failure) reach the user - never a raw provider message. */
  private uploadErrorKey(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    return message.startsWith('instructor.builder.upload.') ? message : 'instructor.builder.upload.transferFailed';
  }
}
