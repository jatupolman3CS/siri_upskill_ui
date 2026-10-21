import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormRecord, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { gradeLabelKey } from '../../../data/tutoring-labels';
import type { CompleteClassResponse, Guid, TutorAttendanceLearner, TutorAttendanceResponse } from '../../../data/tutoring-classes.models';
import { TutoringClassesApiService } from '../../../data/tutoring-classes-api.service';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import { FieldFeedback, focusFirstInvalid } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { SUMMARY_LIMITS, type SummaryFormValue, hasSummaryIssues, summaryRequest, summaryToForm, validateSummary } from '../../tutor-class-form.util';

/** Booking statuses that can carry a lesson summary and feedback (the server decides who actually gets one). */
const SUMMARISABLE = ['Confirmed', 'Completed'];

/**
 * Finishing a class and writing the lesson summary (P13-25). While the class is `Scheduled` this is "Complete class": what was
 * covered (required), homework, next steps and optional feedback per learner. Completing is consequential - it records the tutor
 * as present and lets the server settle each learner's attendance and the money - so it asks for one more confirmation first.
 * After completion the same form edits the summary for a few days (the server closes that window: `summary_locked`).
 * Learners are shown by nickname and grade only. The server's verdicts - too early (with the time it opens), nobody joined, the
 * edit window closed - are shown as they come.
 */
@Component({
  selector: 'app-class-summary-card',
  imports: [ReactiveFormsModule, TranslatePipe, BangkokDatePipe, Button, Modal, Skeleton, TutorProblem, TutorTextarea],
  templateUrl: './class-summary-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ClassSummaryCard {
  private readonly api = inject(TutoringClassesApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  readonly sessionId = input.required<Guid>();
  readonly attendance = input.required<TutorAttendanceResponse>();
  /** The class changed on the server (completed / summary saved): the page should look again. */
  readonly changed = output<void>();

  protected readonly limits = SUMMARY_LIMITS;
  protected readonly gradeKey = gradeLabelKey;

  /** `complete` while the class is open; `edit` once it is completed. */
  protected readonly mode = computed<'complete' | 'edit'>(() => (this.attendance().status === 'Completed' ? 'edit' : 'complete'));
  protected readonly learners = computed<readonly TutorAttendanceLearner[]>(() => this.attendance().learners.filter((learner) => SUMMARISABLE.includes(learner.status)));

  protected readonly form = new FormGroup({
    topicsCovered: new FormControl('', { nonNullable: true }),
    homework: new FormControl('', { nonNullable: true }),
    nextSteps: new FormControl('', { nonNullable: true }),
    feedback: new FormRecord<FormControl<string>>({}),
  });
  protected readonly raw = toSignal<SummaryFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateSummary(this.raw()));
  protected readonly fieldIssues = computed(() => {
    const found = this.issues();
    return { ...found.fields, ...Object.fromEntries(Object.entries(found.feedback).map(([id, issue]) => [`feedback:${id}`, issue])) };
  });
  protected readonly feedback = new FieldFeedback<string>();
  protected readonly saving = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly opensAtUtc = signal<string | null>(null);
  protected readonly result = signal<CompleteClassResponse | null>(null);
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  /** The stored summary, loaded only when there is one to edit. */
  private readonly summaryResource = rxResource({
    params: () => (this.mode() === 'edit' ? this.sessionId() : undefined),
    stream: ({ params }) => this.api.getSummary(params),
  });
  protected readonly loadingSummary = computed(() => this.mode() === 'edit' && this.summaryResource.isLoading() && !this.summaryResource.hasValue());
  /** No summary stored yet (a class the system closed on its own): the form is empty and saving goes through `complete`, which upserts. */
  private readonly noStoredSummary = computed(() => {
    if (this.mode() !== 'edit') {
      return false;
    }
    const error = this.summaryResource.error();
    const notFound = this.summaryResource.status() === 'error' && error instanceof ApiError && error.status === 404;
    return notFound || (this.summaryResource.hasValue() && this.summaryResource.value().topicsCovered === null);
  });
  protected readonly summaryFailed = computed(() => this.mode() === 'edit' && this.summaryResource.status() === 'error' && !this.noStoredSummary());

  constructor() {
    // One feedback box per learner who can have one (added as the roster arrives; never removed, so typing survives a refresh).
    effect(() => {
      const ids = this.learners().map((learner) => learner.bookingId);
      untracked(() => {
        for (const id of ids) {
          if (!this.form.controls.feedback.contains(id)) {
            this.form.controls.feedback.addControl(id, new FormControl('', { nonNullable: true }));
          }
        }
      });
    });
    // Fill the form from the stored summary once it has loaded.
    effect(() => {
      if (!this.summaryResource.hasValue()) {
        return;
      }
      const stored = this.summaryResource.value();
      untracked(() => {
        const next = summaryToForm(stored);
        for (const id of Object.keys(next.feedback)) {
          if (!this.form.controls.feedback.contains(id)) {
            this.form.controls.feedback.addControl(id, new FormControl('', { nonNullable: true }));
          }
        }
        this.form.reset(next);
      });
    });
  }

  protected feedbackControl(bookingId: Guid): FormControl<string> | null {
    return this.form.controls.feedback.contains(bookingId) ? this.form.controls.feedback.controls[bookingId] : null;
  }

  protected message(field: string): string | undefined {
    return this.feedback.messageFor(field, this.fieldIssues(), this.i18n);
  }

  protected retryLoad(): void {
    this.summaryResource.reload();
  }

  /** Validates; completing then asks for a confirmation, saving an edit goes straight through. */
  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.feedback.attempt();
    if (hasSummaryIssues(this.issues())) {
      this.problem.set(this.issues().tooManyFeedbacks ? this.i18n.t('tutoring.tutor.classes.summary.tooManyFeedbacks', { max: SUMMARY_LIMITS.maxFeedbackLearners }) : null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }
    if (this.mode() === 'complete') {
      this.confirmOpen.set(true);
      return;
    }
    this.send();
  }

  protected confirm(): void {
    this.confirmOpen.set(false);
    this.send();
  }

  private send(): void {
    this.saving.set(true);
    this.problem.set(null);
    this.opensAtUtc.set(null);
    const body = summaryRequest(this.raw());
    if (this.mode() === 'complete' || this.noStoredSummary()) {
      this.api.completeClass(this.sessionId(), body).subscribe({
        next: (done) => {
          this.saving.set(false);
          if (this.mode() === 'complete') {
            this.result.set(done);
          }
          this.toast.success(this.i18n.t(this.mode() === 'complete' ? 'tutoring.tutor.classes.summary.completed' : 'tutoring.tutor.classes.summary.saved'));
          this.changed.emit();
        },
        error: (error: unknown) => this.fail(error),
      });
      return;
    }
    this.api.saveSummary(this.sessionId(), body).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.classes.summary.saved'));
        this.changed.emit();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    const detail = tutoringProblemOf(error);
    if (tutoringReasonOf(error) === 'tutoring.complete_too_early' && detail?.opensAtUtc) {
      this.opensAtUtc.set(detail.opensAtUtc);
    }
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
  }
}
