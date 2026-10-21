import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Checkbox } from '../../../../../shared/checkbox/checkbox';
import { InputField } from '../../../../../shared/input/input';
import { Modal } from '../../../../../shared/modal/modal';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { FieldFeedback, parseNumber } from '../../../ui/tutor-form.util';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { adminProblemExtrasOf, isStaleConflict, tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminDisputeApiService } from '../../data/admin-dispute-api.service';
import type { AdminDisputeDetail } from '../../data/admin-dispute.models';
import {
  type DecisionField,
  type DecisionForm,
  type DecisionOutcome,
  EMPTY_DECISION_FORM,
  NOTE_MAX,
  SUSPEND_REASON_MAX,
  buildDecideRequest,
  consequenceKeys,
  decisionIssues,
  outcomesFor,
} from '../dispute-decision.util';
import { formatBaht } from '../dispute-view.util';

/**
 * Decide a dispute (P13-26), in two steps. STEP 1 is the form: an outcome that fits the case's flow (an escrow case can refund
 * fully, partly or not at all, or be rejected; an attendance appeal can only be accepted or rejected - it never moves money), a
 * note BOTH parties will read, and optionally suspending the tutor. Under the chosen outcome the dialog says in plain words what
 * will happen. STEP 2 repeats those sentences with the note and only its confirm button sends the request. The refund's upper limit
 * is the server's: it answers `409 tutoring.refund_exceeds_cap` with the figure, which is then shown. A decision someone else
 * already made is reported to the page, which reloads the case.
 */
@Component({
  selector: 'app-dispute-decision-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, CurrencyThbPipe, Button, Checkbox, InputField, Modal, TutorProblem, TutorTextarea],
  templateUrl: './dispute-decision-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class DisputeDecisionDialog {
  private readonly api = inject(AdminDisputeApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly detail = input.required<AdminDisputeDetail>();
  /** The decision went through: the case as the server has it now. */
  readonly decided = output<AdminDisputeDetail>();
  /** Someone decided or withdrew the case meanwhile: the page should read it again. The payload is the translated reason. */
  readonly stale = output<string>();

  protected readonly noteMax = NOTE_MAX;
  protected readonly suspendMax = SUSPEND_REASON_MAX;
  protected readonly form = new FormGroup({
    outcome: new FormControl<DecisionOutcome | null>(null),
    amount: new FormControl('', { nonNullable: true }),
    overturned: new FormControl(false, { nonNullable: true }),
    compensation: new FormControl(false, { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
    suspend: new FormControl(false, { nonNullable: true }),
    suspendReason: new FormControl('', { nonNullable: true }),
  });
  protected readonly value = toSignal(this.form.valueChanges.pipe(map((): DecisionForm => this.form.getRawValue()), startWith<DecisionForm>(this.form.getRawValue())), {
    requireSync: true,
  });
  protected readonly feedback = new FieldFeedback<DecisionField>();

  protected readonly step = signal<'form' | 'confirm'>('form');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly flow = computed(() => this.detail().flow);
  protected readonly outcomes = computed(() => outcomesFor(this.flow()));
  protected readonly issues = computed(() => decisionIssues(this.value()));
  protected readonly lines = computed(() =>
    consequenceKeys(this.flow(), this.value(), { escrowFreeze: this.detail().escrowFreeze, isPackageBooking: this.detail().isPackageBooking }),
  );
  protected readonly canSuspend = computed(() => this.detail().tutorHistory.status === 'Verified');
  /** The typed partial refund as baht, for the confirmation sentence; empty while it is not a number. */
  protected readonly amountText = computed(() => {
    const amount = parseNumber(this.value().amount);
    return amount === null || Number.isNaN(amount) ? '' : formatBaht(amount, this.i18n.locale());
  });
  protected readonly isAcceptedAppeal = computed(() => this.flow() === 'AttendanceAppeal' && this.value().outcome === 'Resolve');

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.form.reset(EMPTY_DECISION_FORM);
          this.feedback.reset();
          this.step.set('form');
          this.problem.set(null);
        });
      }
    });
  }

  protected errorOf(field: DecisionField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n);
  }

  protected review(): void {
    this.feedback.attempt();
    if (Object.keys(this.issues()).length > 0) {
      return;
    }
    this.problem.set(null);
    this.step.set('confirm');
  }

  protected backToForm(): void {
    this.problem.set(null);
    this.step.set('form');
  }

  protected send(): void {
    if (this.busy()) {
      return;
    }
    const detail = this.detail();
    this.busy.set(true);
    this.problem.set(null);
    this.api.decide(detail.disputeId, buildDecideRequest(detail.flow, this.value())).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.success(this.i18n.t(updated.alreadyDecided ? 'tutoring.admin.disputes.decide.alreadyDone' : 'tutoring.admin.disputes.decide.done'));
        this.decided.emit(updated);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const text = this.i18n.t(tutoringAdminErrorKey(error));
        if (isStaleConflict(error)) {
          this.open.set(false);
          this.stale.emit(text);
          return;
        }
        const cap = adminProblemExtrasOf(error).maxRefundable;
        this.problem.set(cap === undefined ? text : `${text} ${this.i18n.t('tutoring.admin.disputes.decide.maxRefundable', { amount: formatBaht(cap, this.i18n.locale()) })}`);
        // A refused amount (the only refusal tied to a field) sends the administrator back to the field.
        if (cap !== undefined) {
          this.step.set('form');
        }
      },
    });
  }
}
