import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { FieldFeedback, textIssue } from '../../../ui/tutor-form.util';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminDisputeApiService } from '../../data/admin-dispute-api.service';
import type { AdminDisputeDetail } from '../../data/admin-dispute.models';
import { AdminConfirmDialog } from '../../ui/admin-confirm-dialog';

const NOTE_MAX = 1000;

/**
 * Closes the follow-up of an upheld attendance appeal (P13-26): the tutor was compensated OUTSIDE the system (a direct transfer,
 * a lower commission, ...), and this records that it was done, with a note. The system never moves compensation money itself -
 * the dialog says so - and the note goes to the audit trail, not to the parties.
 */
@Component({
  selector: 'app-dispute-compensation-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, AdminConfirmDialog, TutorTextarea],
  template: `
    <app-admin-confirm-dialog
      [(open)]="open"
      [titleText]="'tutoring.admin.disputes.compensation.title' | translate"
      [confirmLabel]="'tutoring.admin.disputes.compensation.confirm' | translate"
      [busy]="busy()"
      [problem]="problem()"
      (confirmed)="submit()"
    >
      <p class="text-sm text-[var(--color-text)]">{{ 'tutoring.admin.disputes.compensation.effect' | translate }}</p>
      <app-tutor-textarea
        [formControl]="note"
        [label]="'tutoring.admin.disputes.compensation.note' | translate"
        [helperText]="'tutoring.admin.disputes.compensation.noteHelp' | translate"
        [errorMessage]="noteError()"
        [maxLength]="max"
        [rows]="3"
        [required]="true"
      />
    </app-admin-confirm-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisputeCompensationDialog {
  private readonly api = inject(AdminDisputeApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly disputeId = input.required<string>();
  readonly settled = output<AdminDisputeDetail>();

  protected readonly max = NOTE_MAX;
  protected readonly note = new FormControl('', { nonNullable: true });
  private readonly noteValue = toSignal(this.note.valueChanges.pipe(startWith('')), { requireSync: true });
  private readonly feedback = new FieldFeedback<'note'>();
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly noteError = computed(() => {
    const found = textIssue(this.noteValue(), 1, NOTE_MAX);
    return found === undefined ? undefined : this.feedback.messageFor('note', { note: found }, this.i18n);
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.note.reset('');
          this.feedback.reset();
          this.problem.set(null);
        });
      }
    });
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.feedback.attempt();
    if (textIssue(this.noteValue(), 1, NOTE_MAX) !== undefined) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    this.api.markCompensationSettled(this.disputeId(), this.noteValue().trim()).subscribe({
      next: (detail) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.success(this.i18n.t('tutoring.admin.disputes.compensation.done'));
        this.settled.emit(detail);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.problem.set(this.i18n.t(tutoringAdminErrorKey(error)));
      },
    });
  }
}
