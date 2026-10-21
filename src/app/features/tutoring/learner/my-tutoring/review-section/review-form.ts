import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Checkbox } from '../../../../../shared/checkbox/checkbox';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { tutoringErrorKey, tutoringReasonOf } from '../../../data/tutoring-errors';
import type { Guid } from '../../../data/tutoring-learner.models';
import { TutoringReviewApiService } from '../../../data/tutoring-review-api.service';
import type { MyReview } from '../../../data/tutoring-review.models';
import { FieldFeedback, type FieldIssues, focusFirstInvalid, issue, trimToNull } from '../../../ui/tutor-form.util';
import { StarRatingInput } from '../../../ui/star-rating-input/star-rating-input';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { REVIEW_LIMITS, reviewCommentIssue } from '../feedback-form.util';

type ReviewField = 'rating' | 'comment';

/** Server refusals that belong to the comment field rather than to the whole form. */
const COMMENT_REASONS: ReadonlySet<string> = new Set([
  'tutoring.text_contains_markup',
  'tutoring.review_comment_contains_meeting_link',
  'tutoring.review_comment_contains_contact',
  'tutoring.review_comment_required',
]);

/**
 * Write (or, when the server allows it, edit) the review of one finished lesson (P13-13). A star rating (a radio group) and an
 * optional plain-text comment; the reviews are PUBLIC, so the form says so before anything is sent, and how a name would appear:
 * a learner is never named by their own nickname when they are a child, and "anonymous" hides the label from the public (the tutor
 * may still guess from the timing - said plainly). Those rules are the server's; the form only explains them.
 * <para>
 * Whether this review is allowed at all is decided by the section that shows the form (`canReview` / `canEdit`). The server
 * re-checks everything, including contact details and links in the comment, and its refusal for the comment is shown under
 * the comment. A second review of the same booking (`review_exists`) hands control back to the section so it can show the
 * existing one. The submit button cannot be pressed twice while the request is in flight.
 * </para>
 */
@Component({
  selector: 'app-review-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Checkbox, StarRatingInput, TutorProblem, TutorTextarea],
  templateUrl: './review-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ReviewForm {
  private readonly api = inject(TutoringReviewApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  readonly bookingId = input.required<Guid>();
  /** The review being edited; `null` writes a new one. */
  readonly existing = input<MyReview | null>(null);
  readonly saved = output<MyReview>();
  /** The booking already has a review (a second tab, a double submit): the section should read the state again. */
  readonly alreadyReviewed = output<void>();
  readonly cancelled = output<void>();

  protected readonly commentMax = REVIEW_LIMITS.comment;
  protected readonly form = new FormGroup({
    rating: new FormControl<number | null>(null),
    comment: new FormControl('', { nonNullable: true }),
    anonymous: new FormControl(false, { nonNullable: true }),
  });
  private readonly raw = toSignal(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed<FieldIssues<ReviewField>>(() => {
    const value = this.raw();
    const found: { rating?: ReturnType<typeof issue>; comment?: ReturnType<typeof issue> } = {};
    if (value.rating === null) {
      found.rating = issue('tutoring.review.validation.ratingRequired');
    }
    const comment = reviewCommentIssue(value.comment);
    if (comment !== undefined) {
      found.comment = comment;
    }
    return found;
  });
  protected readonly feedback = new FieldFeedback<ReviewField>();
  protected readonly anonymous = computed(() => this.raw().anonymous);
  private readonly serverComment = signal<string | null>(null);

  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.existing() !== null);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  constructor() {
    // Starting an edit pre-fills the form with the review that is there.
    effect(() => {
      const existing = this.existing();
      untracked(() => {
        this.form.reset({ rating: existing?.rating ?? null, comment: existing?.comment ?? '', anonymous: existing?.anonymous ?? false });
        this.feedback.reset();
        this.serverComment.set(null);
        this.problem.set(null);
      });
    });
  }

  protected message(field: ReviewField): string | undefined {
    const local = this.feedback.messageFor(field, this.issues(), this.i18n);
    return local ?? (field === 'comment' ? (this.serverComment() ?? undefined) : undefined);
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.feedback.attempt();
    this.serverComment.set(null);
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }
    const value = this.form.getRawValue();
    const body = { rating: value.rating ?? 0, comment: trimToNull(value.comment), anonymous: value.anonymous };
    this.saving.set(true);
    this.problem.set(null);
    const call = this.isEdit() ? this.api.updateReview(this.bookingId(), body) : this.api.createReview(this.bookingId(), body);
    call.subscribe({
      next: (review) => {
        this.saving.set(false);
        this.toast.success(this.i18n.t(this.isEdit() ? 'tutoring.review.updated' : 'tutoring.review.created'));
        this.saved.emit(review);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.onFailed(error);
      },
    });
  }

  private onFailed(error: unknown): void {
    const reason = tutoringReasonOf(error);
    if (reason === 'tutoring.review_exists' && !this.isEdit()) {
      this.alreadyReviewed.emit();
      return;
    }
    if (reason !== undefined && COMMENT_REASONS.has(reason)) {
      this.serverComment.set(this.i18n.t(tutoringErrorKey(error)));
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
  }
}
