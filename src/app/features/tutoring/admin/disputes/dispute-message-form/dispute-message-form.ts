import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { newClientId } from '../../../data/tutoring-my.util';
import { FieldFeedback, textIssue } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminDisputeApiService } from '../../data/admin-dispute-api.service';
import type { AdminDisputeMessage, DisputeVisibility } from '../../data/admin-dispute.models';

export const MESSAGE_MAX = 2000;

/**
 * An administrator's line in a dispute (P13-26). Two kinds, and the default is the cautious one: an INTERNAL note (only
 * administrators ever see it; allowed in any state) or a message to the PARTIES (the learner and the tutor both read it and are
 * e-mailed; only while the case is still open). The choice is a pair of radio buttons with the consequence written under the
 * chosen one. Each message is sent with a `clientMessageId` made when the form is ready, so a retry after a lost answer posts once;
 * it is renewed only after a message went through. The send button cannot be pressed twice while a request is in flight.
 */
@Component({
  selector: 'app-dispute-message-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, TutorProblem, TutorTextarea],
  templateUrl: './dispute-message-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisputeMessageForm {
  private readonly api = inject(AdminDisputeApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly disputeId = input.required<string>();
  /** The case is still open, so a message to the parties is possible (an internal note always is). */
  readonly canMessageParties = input(true);
  readonly posted = output<AdminDisputeMessage>();

  protected readonly max = MESSAGE_MAX;
  protected readonly visibilities: readonly DisputeVisibility[] = ['Internal', 'Parties'];
  protected readonly body = new FormControl('', { nonNullable: true });
  private readonly bodyValue = toSignal(this.body.valueChanges.pipe(startWith('')), { requireSync: true });
  protected readonly visibility = signal<DisputeVisibility>('Internal');
  protected readonly feedback = new FieldFeedback<'body'>();
  private clientMessageId = newClientId();

  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly bodyError = computed(() => {
    const found = textIssue(this.bodyValue(), 1, MESSAGE_MAX);
    return found === undefined ? undefined : this.feedback.messageFor('body', { body: found }, this.i18n);
  });
  /** A closed case takes internal notes only, whatever was picked. */
  protected readonly effectiveVisibility = computed<DisputeVisibility>(() => (this.canMessageParties() ? this.visibility() : 'Internal'));

  protected choose(next: DisputeVisibility): void {
    this.visibility.set(next);
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.feedback.attempt();
    if (textIssue(this.bodyValue(), 1, MESSAGE_MAX) !== undefined) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    this.api
      .postMessage(this.disputeId(), { clientMessageId: this.clientMessageId, body: this.bodyValue().trim(), visibility: this.effectiveVisibility(), evidenceLinks: null })
      .subscribe({
        next: (message) => {
          this.busy.set(false);
          this.clientMessageId = newClientId();
          this.body.reset('');
          this.feedback.reset();
          this.toast.success(this.i18n.t(`tutoring.admin.disputes.message.sent.${message.visibility}`));
          this.posted.emit(message);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.problem.set(this.i18n.t(tutoringAdminErrorKey(error)));
        },
      });
  }
}
