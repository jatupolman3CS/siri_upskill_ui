import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { TutorDisputeApiService } from '../../../data/tutor-dispute-api.service';
import { tutoringErrorKey, tutoringReasonOf } from '../../../data/tutoring-errors';
import type { Guid } from '../../../data/tutoring-learner.models';
import { newClientId } from '../../../data/tutoring-my.util';
import { FieldFeedback } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { TutorEvidenceLinksField } from '../../ui/tutor-evidence-links-field/tutor-evidence-links-field';
import {
  TUTOR_DISPUTE_LIMITS,
  type TutorEvidenceRow,
  tutorDisputeMessageIssue,
  tutorEvidenceInputs,
  tutorFirstEvidenceIssue,
} from '../../ui/tutor-evidence-links-field/tutor-feedback-form.util';

const BODY_REASONS: ReadonlySet<string> = new Set(['tutoring.dispute_text_contains_contact', 'tutoring.text_contains_markup']);

/**
 * Tutor response form in a dispute thread (P13-14 / P13-35).
 * Sends a message and optional evidence links using `TutorDisputeApiService.postMessage`.
 * Uses clientMessageId for idempotency.
 */
@Component({
  selector: 'app-tutor-dispute-reply-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, TutorProblem, TutorTextarea, TutorEvidenceLinksField],
  templateUrl: './tutor-dispute-reply-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TutorDisputeReplyForm {
  private readonly api = inject(TutorDisputeApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly disputeId = input.required<Guid>();
  readonly linksLeft = input<number>(TUTOR_DISPUTE_LIMITS.maxLinks);
  readonly posted = output<void>();

  protected readonly limits = TUTOR_DISPUTE_LIMITS;
  protected readonly body = new FormControl('', { nonNullable: true });
  private readonly bodyValue = toSignal(this.body.valueChanges.pipe(startWith('')), { requireSync: true });
  protected readonly feedback = new FieldFeedback<'body'>();
  private readonly evidence = signal<readonly TutorEvidenceRow[]>([]);
  private readonly serverBody = signal<string | null>(null);
  private readonly links = viewChild(TutorEvidenceLinksField);
  private clientMessageId = newClientId();

  protected readonly showEvidenceErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly bodyError = computed(() => {
    const found = tutorDisputeMessageIssue(this.bodyValue());
    return (found === undefined ? undefined : this.feedback.messageFor('body', { body: found }, this.i18n)) ?? this.serverBody() ?? undefined;
  });

  protected onEvidence(rows: readonly TutorEvidenceRow[]): void {
    this.evidence.set(rows);
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.feedback.attempt();
    this.showEvidenceErrors.set(true);
    this.serverBody.set(null);
    if (tutorDisputeMessageIssue(this.bodyValue()) !== undefined || tutorFirstEvidenceIssue(this.evidence()) !== undefined) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    const request = {
      clientMessageId: this.clientMessageId,
      body: this.bodyValue().trim(),
      evidenceLinks: tutorEvidenceInputs(this.evidence()),
    };
    this.api.postMessage(this.disputeId(), request).subscribe({
      next: () => {
        this.busy.set(false);
        this.body.reset('');
        this.links()?.clear();
        this.feedback.reset();
        this.showEvidenceErrors.set(false);
        this.clientMessageId = newClientId();
        this.toast.success(this.i18n.t('tutoring.tutor.disputes.reply.sent'));
        this.posted.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const reason = tutoringReasonOf(error);
        if (reason !== undefined && BODY_REASONS.has(reason)) {
          this.serverBody.set(this.i18n.t(tutoringErrorKey(error)));
          return;
        }
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
