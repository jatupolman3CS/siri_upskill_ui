import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { type SelectOption, SelectField } from '../../../../../shared/select/select';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { TutorDisputeApiService } from '../../../data/tutor-dispute-api.service';
import type { DisputeCategory } from '../../../data/tutoring-dispute.models';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import { disputeCategoryLabelKey } from '../../../data/tutoring-labels';
import type { Guid } from '../../../data/tutoring-learner.models';
import { newClientId } from '../../../data/tutoring-my.util';
import { FieldFeedback } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { TutorEvidenceLinksField } from '../tutor-evidence-links-field/tutor-evidence-links-field';
import {
  TUTOR_DISPUTE_LIMITS,
  type TutorEvidenceRow,
  tutorDisputeDescriptionIssue,
  tutorEvidenceInputs,
  tutorFirstEvidenceIssue,
} from '../tutor-evidence-links-field/tutor-feedback-form.util';

const DESCRIPTION_REASONS: ReadonlySet<string> = new Set(['tutoring.dispute_text_contains_contact', 'tutoring.text_contains_markup']);

/**
 * "Open Dispute / Attendance Appeal" from the tutor portal (P13-14 / P13-35).
 * Asks the server whether the tutor can open a dispute for this booking, which categories are allowed,
 * and whether the class funds will be held. Contact details in text are blocked on server.
 */
@Component({
  selector: 'app-tutor-open-dispute-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    Button,
    Modal,
    SelectField,
    Skeleton,
    TutorProblem,
    TutorTextarea,
    TutorEvidenceLinksField,
  ],
  templateUrl: './tutor-open-dispute-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorOpenDisputeDialog {
  private readonly api = inject(TutorDisputeApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly bookingId = input.required<Guid>();

  protected readonly limits = TUTOR_DISPUTE_LIMITS;

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
  private readonly evidence = signal<readonly TutorEvidenceRow[]>([]);
  private readonly serverDescription = signal<string | null>(null);

  protected readonly categoryOptions = computed<readonly SelectOption[]>(() => {
    const allowed = this.state()?.allowedCategories ?? [];
    return [
      { value: '', label: this.i18n.t('tutoring.tutor.disputes.open.categoryPlaceholder') },
      ...allowed.map((cat) => ({ value: cat, label: this.i18n.t(disputeCategoryLabelKey(cat)) })),
    ];
  });

  protected readonly submitting = signal(false);
  protected readonly submitProblem = signal<string | null>(null);
  protected readonly conflictDisputeId = signal<string | null>(null);
  protected readonly showEvidenceErrors = signal(false);

  protected readonly categoryError = computed(() => {
    return this.raw().category === ''
      ? this.feedback.messageFor('category', { category: { key: 'tutoring.tutor.disputes.validation.categoryRequired' } }, this.i18n)
      : undefined;
  });
  protected readonly descriptionError = computed(() => {
    const found = tutorDisputeDescriptionIssue(this.raw().description);
    return (
      (found === undefined ? undefined : this.feedback.messageFor('description', { description: found }, this.i18n)) ??
      this.serverDescription() ??
      undefined
    );
  });

  private clientRequestId = newClientId();

  protected reloadState(): void {
    this.stateResource.reload();
  }

  protected onEvidence(rows: readonly TutorEvidenceRow[]): void {
    this.evidence.set(rows);
  }

  protected submit(): void {
    if (this.submitting() || !this.state()?.canOpen) {
      return;
    }
    this.feedback.attempt();
    this.serverDescription.set(null);
    const value = this.raw();
    if (value.category === '' || tutorDisputeDescriptionIssue(value.description) !== undefined || tutorFirstEvidenceIssue(this.evidence()) !== undefined) {
      return;
    }

    this.submitting.set(true);
    this.submitProblem.set(null);
    this.conflictDisputeId.set(null);

    const request = {
      category: value.category,
      description: value.description.trim(),
      evidenceLinks: tutorEvidenceInputs(this.evidence()),
      clientRequestId: this.clientRequestId,
    };

    this.api.openDispute(this.bookingId(), request).subscribe({
      next: (dispute) => {
        this.submitting.set(false);
        this.open.set(false);
        this.toast.success(this.i18n.t('tutoring.tutor.disputes.open.done'));
        void this.router.navigate(['/instructor/tutoring/disputes', dispute.disputeId]);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const reason = tutoringReasonOf(error);
        const problem = tutoringProblemOf(error);
        if (problem?.disputeId) {
          this.conflictDisputeId.set(problem.disputeId);
        }
        if (reason !== undefined && DESCRIPTION_REASONS.has(reason)) {
          this.serverDescription.set(this.i18n.t(tutoringErrorKey(error)));
          return;
        }
        this.submitProblem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
