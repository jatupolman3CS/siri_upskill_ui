import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminReviewApiService } from '../../data/admin-review-api.service';
import type { AdminReviewListItem } from '../../../data/tutoring-review.models';
import { AdminConfirmDialog } from '../../ui/admin-confirm-dialog';

@Component({
  selector: 'app-review-moderation-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, AdminConfirmDialog, TutorTextarea],
  templateUrl: './review-moderation-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewModerationDialog {
  private readonly api = inject(AdminReviewApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly mode = input.required<'hide' | 'unhide'>();
  readonly review = input.required<AdminReviewListItem>();
  readonly done = output<void>();

  protected readonly reasonControl = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly titleKey = computed(() =>
    this.mode() === 'hide' ? 'tutoring.admin.reviews.hideDialog.title' : 'tutoring.admin.reviews.unhideDialog.title',
  );

  protected readonly descriptionKey = computed(() =>
    this.mode() === 'hide'
      ? 'tutoring.admin.reviews.hideDialog.description'
      : 'tutoring.admin.reviews.unhideDialog.description',
  );

  protected readonly confirmKey = computed(() =>
    this.mode() === 'hide'
      ? 'tutoring.admin.reviews.hideDialog.confirm'
      : 'tutoring.admin.reviews.unhideDialog.confirm',
  );

  protected readonly labelKey = computed(() =>
    this.mode() === 'hide'
      ? 'tutoring.admin.reviews.hideDialog.reasonLabel'
      : 'tutoring.admin.reviews.unhideDialog.noteLabel',
  );

  confirm(): void {
    const text = this.reasonControl.value.trim();
    if (this.mode() === 'hide' && !text) {
      this.problem.set(this.i18n.t('tutoring.admin.reviews.hideDialog.reasonRequired'));
      return;
    }

    this.busy.set(true);
    this.problem.set(null);

    const request$ =
      this.mode() === 'hide'
        ? this.api.hideReview(this.review().reviewId, { reason: text })
        : this.api.unhideReview(this.review().reviewId, { note: text || undefined });

    request$.subscribe({
      next: () => {
        this.busy.set(false);
        this.open.set(false);
        this.reasonControl.reset();
        this.done.emit();
      },
      error: (err) => {
        this.busy.set(false);
        const errorKey = tutoringAdminErrorKey(err);
        this.problem.set(this.i18n.t(errorKey));
      },
    });
  }
}
