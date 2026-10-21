import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorInfo, phosphorTrash, phosphorUploadSimple, phosphorUser } from '@ng-icons/phosphor-icons/regular';
import type { Observable } from 'rxjs';

import { MediaUrlPipe } from '../../../../../core/pipes/media-url.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutoringTutorApiService } from '../../../data/tutoring-tutor-api.service';
import { extensionOf } from '../../../data/tutoring-kyc-api.service';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/** The server accepts JPEG / PNG / WebP up to its configured size (default 2 MiB); the same limits as a courtesy check. */
const ALLOWED_EXTENSIONS: readonly string[] = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Profile photo (P13-01 `PUT/DELETE tutor/profile/photo`). The photo is shown to learners on the public profile once the
 * tutor is verified and listed. The server validates the real image content and keeps no file name; the page only checks
 * type and size up front. A change rotates the profile's concurrency token, so the owner page is asked to reload (`changed`).
 */
@Component({
  selector: 'app-tutor-photo-panel',
  imports: [NgOptimizedImage, NgIcon, MediaUrlPipe, TranslatePipe, Button, TutorProblem],
  templateUrl: './photo-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorInfo, phosphorTrash, phosphorUploadSimple, phosphorUser })],
})
export class PhotoPanel {
  private readonly api = inject(TutoringTutorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly photoUrl = input<string | null>(null);
  readonly displayName = input.required<string>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  private readonly errorKey = signal<string | null>(null);
  protected readonly problem = computed(() => {
    const key = this.errorKey();
    return key === null ? null : this.i18n.t(key);
  });

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (file === null || this.busy() || this.disabled()) {
      return;
    }
    if (file.size === 0 || file.size > MAX_BYTES || !ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
      this.errorKey.set('tutoring.errors.imageInvalid');
      return;
    }
    this.run(this.api.uploadPhoto(file), 'tutoring.tutor.photo.uploaded');
  }

  protected remove(): void {
    if (!this.busy() && !this.disabled()) {
      this.run(this.api.deletePhoto(), 'tutoring.tutor.photo.removed');
    }
  }

  private run(request: Observable<unknown>, successKey: string): void {
    this.busy.set(true);
    this.errorKey.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(this.i18n.t(successKey));
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.errorKey.set(tutoringErrorKey(error));
      },
    });
  }
}
