import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { type SelectOption, SelectField } from '../../../../../shared/select/select';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { TutoringDisputeApiService } from '../../../data/tutoring-dispute-api.service';
import type { DisputeCategory } from '../../../data/tutoring-dispute.models';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import { disputeCategoryLabelKey } from '../../../data/tutoring-labels';
import type { Guid } from '../../../data/tutoring-learner.models';
import { newClientId } from '../../../data/tutoring-my.util';
import { FieldFeedback } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { EvidenceLinksField } from '../evidence-links-field/evidence-links-field';
import { DISPUTE_LIMITS, type EvidenceRow, disputeDescriptionIssue, evidenceInputs, firstEvidenceIssue } from '../feedback-form.util';

/** Refusals that belong under the description field (contact details are not allowed in a dispute). */
const DESCRIPTION_REASONS: ReadonlySet<string> = new Set(['tutoring.dispute_text_contains_contact', 'tutoring.text_contains_markup']);

/**
 * "Report a problem" (P13-14): opens a dispute for one finished lesson. On opening, the dialog asks the SERVER whether a dispute
 * can be opened for this booking, which categories are allowed, how long the window is and whether the class's money will be held;
 * nothing of that is decided here. If it cannot be opened, the reason is explained in plain words (and an existing case is linked).
 * <para>
 * The form says plainly, before anything is sent, that the payment of the class is held while the team looks into it and that
 * contact details are not allowed (the conversation stays on the platform, for everyone's safety). The request carries a
 * `clientRequestId` made once per opening of the dialog, so a retry after a lost answer opens the same case, never two. The
 * evidence is links only (https). On success the person lands on the case's page.
 * </para>
 */
@Component({
  selector: 'app-open-dispute-dialog',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, BangkokDatePipe, Button, Modal, SelectField, Skeleton, TutorProblem, TutorTextarea, EvidenceLinksField],
  templateUrl: './open-dispute-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenDisputeDialog {
  private readonly api = inject(TutoringDisputeApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly bookingId = input.required<Guid>();

  protected readonly limits = DISPUTE_LIMITS;

  /** Asked afresh each time the dialog opens: the window or the booking's status may have moved since the page loaded. */
  private readonly stateResource = rxResource({
    params: () => (this.open() ? this.bookingId() : undefined),
    stream: ({ params }) => this.api.getDisputeState(params),
  });
  protected readonly state = computed(() => (this.stateResource.hasValue() ? this.stateResource.value() : null));
  protected readonly stateLoading = computed(() => this.open() && this.stateResource.isLoading() && !this.stateResource.hasValue());
  protected readonly stateFailed = computed(() => this.stateResource.status() === 'error');

  protected readonly form = new FormGroup({
    category: new FormControl<DisputeCategory | ''>('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
  });
  private readonly raw = toSignal(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly feedback = new FieldFeedback<'category' | 'description'>();
  private readonly evidence = signal<readonly EvidenceRow[]>([]);
  private readonly serverDescription = signal<string | null>(null);
  private clientRequestId = newClientId();

  protected readonly categoryOptions = computed<readonly SelectOption[]>(() => [
    { value: '', label: this.i18n.t('tutoring.dispute.open.categoryPlaceholder') },
    ...(this.state()?.allowedCategories ?? []).map((category) => ({ value: category, label: this.i18n.t(disputeCategoryLabelKey(category)) })),
  ]);
  protected readonly categoryError = computed(() =>
    this.raw().category === '' ? this.feedback.messageFor('category', { category: { key: 'tutoring.dispute.validation.categoryRequired' } }, this.i18n) : undefined,
  );
  protected readonly descriptionError = computed(() => {
    const found = disputeDescriptionIssue(this.raw().description);
    return (found === undefined ? undefined : this.feedback.messageFor('description', { description: found }, this.i18n)) ?? this.serverDescription() ?? undefined;
  });
  protected readonly showEvidenceErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  /** The case that already exists, when the server says so (`dispute_already_open | dispute_already_decided`). */
  protected readonly existingCase = signal<Guid | null>(null);

  constructor() {
    // Every opening starts clean, with a fresh idempotency key.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.form.reset({ category: '', description: '' });
          this.feedback.reset();
          this.serverDescription.set(null);
          this.showEvidenceErrors.set(false);
          this.problem.set(null);
          this.existingCase.set(null);
          this.clientRequestId = newClientId();
        });
      }
    });
  }

  protected onEvidence(rows: readonly EvidenceRow[]): void {
    this.evidence.set(rows);
  }

  protected retryState(): void {
    this.stateResource.reload();
  }

  protected submit(): void {
    if (this.busy() || this.state()?.canOpen !== true) {
      return;
    }
    this.feedback.attempt();
    this.showEvidenceErrors.set(true);
    this.serverDescription.set(null);
    const value = this.form.getRawValue();
    if (value.category === '' || disputeDescriptionIssue(value.description) !== undefined || firstEvidenceIssue(this.evidence()) !== undefined) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    const request = {
      category: value.category,
      description: value.description.trim(),
      evidenceLinks: evidenceInputs(this.evidence()),
      clientRequestId: this.clientRequestId,
    };
    this.api.openDispute(this.bookingId(), request).subscribe({
      next: (dispute) => {
        this.busy.set(false);
        this.toast.success(this.i18n.t('tutoring.dispute.open.done'));
        this.open.set(false);
        void this.router.navigate(['/my-tutoring/disputes', dispute.disputeId]);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.onFailed(error);
      },
    });
  }

  private onFailed(error: unknown): void {
    const reason = tutoringReasonOf(error);
    const caseId = tutoringProblemOf(error)?.disputeId;
    if (caseId !== undefined && (reason === 'tutoring.dispute_already_open' || reason === 'tutoring.dispute_already_decided')) {
      this.existingCase.set(caseId);
    }
    if (reason !== undefined && DESCRIPTION_REASONS.has(reason)) {
      this.serverDescription.set(this.i18n.t(tutoringErrorKey(error)));
      return;
    }
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
  }
}
