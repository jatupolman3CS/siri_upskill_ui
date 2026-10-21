import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { TutoringDisputeApiService } from '../../../data/tutoring-dispute-api.service';
import { tutoringErrorKey, tutoringReasonOf } from '../../../data/tutoring-errors';
import type { Guid } from '../../../data/tutoring-learner.models';
import { newClientId } from '../../../data/tutoring-my.util';
import { FieldFeedback } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { EvidenceLinksField } from '../evidence-links-field/evidence-links-field';
import { DISPUTE_LIMITS, type EvidenceRow, disputeMessageIssue, evidenceInputs, firstEvidenceIssue } from '../feedback-form.util';

/** Refusals that belong under the message field. */
const BODY_REASONS: ReadonlySet<string> = new Set(['tutoring.dispute_text_contains_contact', 'tutoring.text_contains_markup']);

/**
 * Answer in a dispute thread. A message is plain text (1-2000 characters) and may carry evidence links; contact details are not
 * allowed (the conversation stays on the platform). Each message is sent with a `clientMessageId` made when the form is ready, so
 * a retry after a lost answer posts the same message once; the id is renewed only after a message went through. The send button
 * cannot be pressed twice while a request is in flight. Whether a reply is possible at all is the server's (`canPostMessage`) -
 * the page only shows this form when it is.
 */
@Component({
  selector: 'app-dispute-reply-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, TutorProblem, TutorTextarea, EvidenceLinksField],
  templateUrl: './dispute-reply-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DisputeReplyForm {
  private readonly api = inject(TutoringDisputeApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly disputeId = input.required<Guid>();
  /** How many more links the case can take (the case allows ten in all). */
  readonly linksLeft = input<number>(DISPUTE_LIMITS.maxLinks);
  /** A message went through: the page should read the case again. */
  readonly posted = output<void>();

  protected readonly limits = DISPUTE_LIMITS;
  protected readonly body = new FormControl('', { nonNullable: true });
  private readonly bodyValue = toSignal(this.body.valueChanges.pipe(startWith('')), { requireSync: true });
  protected readonly feedback = new FieldFeedback<'body'>();
  private readonly evidence = signal<readonly EvidenceRow[]>([]);
  private readonly serverBody = signal<string | null>(null);
  private readonly links = viewChild(EvidenceLinksField);
  private clientMessageId = newClientId();

  protected readonly showEvidenceErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly bodyError = computed(() => {
    const found = disputeMessageIssue(this.bodyValue());
    return (found === undefined ? undefined : this.feedback.messageFor('body', { body: found }, this.i18n)) ?? this.serverBody() ?? undefined;
  });

  protected onEvidence(rows: readonly EvidenceRow[]): void {
    this.evidence.set(rows);
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.feedback.attempt();
    this.showEvidenceErrors.set(true);
    this.serverBody.set(null);
    if (disputeMessageIssue(this.bodyValue()) !== undefined || firstEvidenceIssue(this.evidence()) !== undefined) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    const request = { clientMessageId: this.clientMessageId, body: this.bodyValue().trim(), evidenceLinks: evidenceInputs(this.evidence()) };
    this.api.postMessage(this.disputeId(), request).subscribe({
      next: () => {
        this.busy.set(false);
        this.body.reset('');
        this.links()?.clear();
        this.feedback.reset();
        this.showEvidenceErrors.set(false);
        this.clientMessageId = newClientId();
        this.toast.success(this.i18n.t('tutoring.dispute.reply.sent'));
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
