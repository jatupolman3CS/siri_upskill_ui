import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorUploadSimple, phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';
import { Observable, Subscription, filter, last, of, switchMap, take, tap, throwError } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { MediaApiService } from '../../../../media/data/media-api.service';
import type { MediaAssetResponse } from '../../../../media/data/media-api.models';
import { LiveInstructorApiService } from '../../../data/live-instructor-api.service';
import type { LiveSessionRecording } from '../../../data/live-instructor.models';
import { type ProblemMessage, instructorProblemMessage } from '../../../data/live-instructor.util';

type Stage = 'idle' | 'uploading' | 'processing' | 'attaching' | 'failed';

/**
 * "Upload recording" for one finished session: upload the video through the normal media pipeline (create asset -> TUS
 * upload -> complete -> wait until `Ready`), then attach the asset to the session (`POST …/recording`), which turns it into
 * an ordinary course episode learners can replay. Re-uploading replaces the recording in place (the API reports
 * `replacedExisting`).
 */
@Component({
  selector: 'app-live-recording-uploader',
  imports: [NgIcon, TranslatePipe, Button],
  templateUrl: './recording-uploader.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorUploadSimple, phosphorWarningCircle })],
  host: { class: 'block' },
})
export class RecordingUploader {
  private readonly media = inject(MediaApiService);
  private readonly api = inject(LiveInstructorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly courseId = input.required<string>();
  readonly sessionId = input.required<string>();
  readonly sessionTitle = input.required<string>();
  /** The session already has a recording attached — the action becomes "replace". */
  readonly hasRecording = input(false);
  readonly attached = output<LiveSessionRecording>();

  protected readonly stage = signal<Stage>('idle');
  protected readonly progress = signal(0);
  protected readonly problem = signal<ProblemMessage | null>(null);
  protected readonly errorKey = signal<string | null>(null);
  /** Set once the asset is `Ready`, so a failed attach can be retried without uploading the file again. */
  private readonly readyAssetId = signal<string | null>(null);
  private subscription: Subscription | null = null;

  protected readonly busy = computed(() => ['uploading', 'processing', 'attaching'].includes(this.stage()));
  protected readonly errorText = computed(() => {
    const message = this.problem();
    if (message) {
      return this.i18n.t(message.key, message.params);
    }
    const key = this.errorKey();
    return key ? this.i18n.t(key) : null;
  });
  protected readonly canRetryAttach = computed(() => this.stage() === 'failed' && this.readyAssetId() !== null);

  constructor() {
    this.destroyRef.onDestroy(() => this.subscription?.unsubscribe());
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) {
      return;
    }
    const invalid = this.media.validateVideoFile(file);
    if (invalid) {
      this.fail(invalid);
      return;
    }
    this.begin('uploading');
    this.readyAssetId.set(null);
    this.subscription?.unsubscribe();
    this.subscription = this.uploadAndWait(file)
      .pipe(switchMap((asset) => this.checkReady(asset)))
      .subscribe({
        next: (assetId) => this.attach(assetId),
        error: (error: unknown) => this.fail(this.uploadErrorKey(error)),
      });
  }

  protected retryAttach(): void {
    const assetId = this.readyAssetId();
    if (assetId && !this.busy()) {
      this.attach(assetId);
    }
  }

  private uploadAndWait(file: File): Observable<MediaAssetResponse> {
    const title = `${this.sessionTitle()} — recording`;
    return this.media.createAsset({ title }).pipe(
      switchMap((asset) =>
        this.media.createUploadSession(asset.id).pipe(
          switchMap((session) =>
            this.media.uploadVideoFile(session.uploadUrl, file).pipe(
              tap((event) => this.progress.set(event.progress)),
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

  private checkReady(asset: MediaAssetResponse): Observable<string> {
    return asset.status === 'Ready'
      ? of(asset.id)
      : throwError(() => new Error('instructor.builder.upload.processingFailed'));
  }

  private attach(mediaAssetId: string): void {
    this.begin('attaching');
    this.readyAssetId.set(mediaAssetId);
    this.api.attachRecording(this.courseId(), this.sessionId(), { mediaAssetId }).subscribe({
      next: (recording) => {
        this.stage.set('idle');
        this.readyAssetId.set(null);
        this.toast.success(this.i18n.t('live.instructor.recording.attached'));
        this.attached.emit(recording);
      },
      error: (error: unknown) => {
        this.stage.set('failed');
        this.problem.set(instructorProblemMessage(error));
      },
    });
  }

  private begin(stage: Stage): void {
    this.stage.set(stage);
    this.problem.set(null);
    this.errorKey.set(null);
  }

  private fail(key: string): void {
    this.stage.set('failed');
    this.problem.set(null);
    this.errorKey.set(key);
  }

  /** Only our own i18n keys (or the generic transfer failure) ever reach the user — never a raw provider message. */
  private uploadErrorKey(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    return message.startsWith('instructor.builder.upload.') ? message : 'instructor.builder.upload.transferFailed';
  }
}
