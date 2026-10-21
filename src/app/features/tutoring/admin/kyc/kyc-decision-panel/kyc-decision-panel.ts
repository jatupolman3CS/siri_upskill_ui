import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { FieldFeedback } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { adminProblemExtrasOf, isStaleConflict, tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminKycApiService } from '../../data/admin-kyc-api.service';
import type { AdminKycCaseDetail, KycDecision } from '../../data/admin-kyc.models';
import { AdminConfirmDialog } from '../../ui/admin-confirm-dialog';
import { KYC_NOTE_MAX, type KycDecisionIssue, type VerdictMap, isDecidable, kycDecisionIssue, pendingDocuments, verdictsToSend } from '../kyc-case.util';

const DECISIONS: readonly KycDecision[] = ['Approve', 'NeedsInfo', 'Reject'];

/**
 * Decide one KYC case (P13-26): approve, ask for more, or reject. Nothing is preselected - an approval must be a deliberate
 * choice. The note is mandatory unless approving and is shown to the applicant (stated beside the field). Pressing the button
 * opens a confirmation that says in plain words what will happen, and only its confirm button sends the request with the case's
 * `rowVersion`; the button is disabled while the request is in flight. A stale token / an already decided case is reported to
 * the page, which reloads the case. Whether a decision is allowed is the server's call - the form checks only what is cheap.
 */
@Component({
  selector: 'app-kyc-decision-panel',
  imports: [ReactiveFormsModule, TranslatePipe, Button, AdminConfirmDialog, TutorProblem, TutorTextarea],
  templateUrl: './kyc-decision-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycDecisionPanel {
  private readonly api = inject(AdminKycApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly detail = input.required<AdminKycCaseDetail>();
  readonly verdicts = input<VerdictMap>({});

  /** The case as the server has it after a decision or "start review". */
  readonly updated = output<AdminKycCaseDetail>();
  /** The case changed under the reviewer: the page should load it again. The payload is the translated reason. */
  readonly stale = output<string>();

  protected readonly options = DECISIONS;
  protected readonly noteMax = KYC_NOTE_MAX;
  protected readonly decision = signal<KycDecision | null>(null);
  protected readonly note = new FormControl('', { nonNullable: true });
  private readonly noteValue = toSignal(this.note.valueChanges.pipe(startWith('')), { requireSync: true });
  protected readonly feedback = new FieldFeedback<'note'>();

  protected readonly confirmOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly starting = signal(false);
  protected readonly problem = signal<string | null>(null);

  private readonly caseId = computed(() => this.detail().caseId);
  protected readonly decidable = computed(() => isDecidable(this.detail().status));
  protected readonly pending = computed(() => pendingDocuments(this.detail()));
  protected readonly undecidedCount = computed(() => this.pending().filter((document) => this.verdicts()[document.documentId] === undefined).length);
  protected readonly issue = computed<KycDecisionIssue | null>(() => {
    const decision = this.decision();
    return decision === null ? null : kycDecisionIssue(decision, this.noteValue(), this.undecidedCount());
  });
  protected readonly noteError = computed(() => {
    const found = this.issue();
    return found === 'noteRequired' || found === 'noteTooLong'
      ? this.feedback.messageFor('note', { note: { key: `tutoring.admin.kyc.decision.issue.${found}`, params: { max: KYC_NOTE_MAX } } }, this.i18n)
      : undefined;
  });
  protected readonly approveBlocked = computed(() => this.decision() === 'Approve' && this.issue() === 'undecidedDocuments');

  constructor() {
    // A different case starts with a clean form (a refreshed copy of the same case - after "start review" - keeps the reviewer's work).
    effect(() => {
      this.caseId();
      untracked(() => {
        this.decision.set(null);
        this.note.reset('');
        this.feedback.reset();
        this.problem.set(null);
      });
    });
  }

  protected choose(decision: KycDecision): void {
    this.decision.set(decision);
    this.problem.set(null);
  }

  protected review(): void {
    const decision = this.decision();
    this.feedback.attempt();
    if (decision === null || this.issue() !== null) {
      return;
    }
    this.problem.set(null);
    this.confirmOpen.set(true);
  }

  protected send(): void {
    const decision = this.decision();
    if (this.busy() || decision === null) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    const note = this.noteValue().trim();
    this.api
      .decide(this.detail().caseId, { decision, note: note.length > 0 ? note : null, documents: verdictsToSend(this.detail(), this.verdicts()), rowVersion: this.detail().rowVersion })
      .subscribe({
        next: (detail) => {
          this.busy.set(false);
          this.confirmOpen.set(false);
          this.toast.success(this.i18n.t(`tutoring.admin.kyc.decision.done.${decision}`));
          this.updated.emit(detail);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const text = this.i18n.t(tutoringAdminErrorKey(error));
          if (isStaleConflict(error)) {
            this.confirmOpen.set(false);
            this.stale.emit(text);
            return;
          }
          const types = adminProblemExtrasOf(error).types;
          this.problem.set(types?.length ? `${text} (${types.map((type) => this.i18n.t(`tutoring.enums.kycDocumentType.${type}`)).join(', ')})` : text);
        },
      });
  }

  protected startReview(): void {
    if (this.starting()) {
      return;
    }
    this.starting.set(true);
    this.api.startReview(this.detail().caseId).subscribe({
      next: (detail) => {
        this.starting.set(false);
        this.updated.emit(detail);
      },
      error: (error: unknown) => {
        this.starting.set(false);
        this.problem.set(this.i18n.t(tutoringAdminErrorKey(error)));
      },
    });
  }
}
