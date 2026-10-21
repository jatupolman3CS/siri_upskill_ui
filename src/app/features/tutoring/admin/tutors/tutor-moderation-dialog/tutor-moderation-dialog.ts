import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Checkbox } from '../../../../../shared/checkbox/checkbox';
import { InputField } from '../../../../../shared/input/input';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { FieldFeedback } from '../../../ui/tutor-form.util';
import { TutorTextarea } from '../../../ui/tutor-textarea/tutor-textarea';
import { tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminTutorApiService } from '../../data/admin-tutor-api.service';
import type { AdminTutorDetail } from '../../data/admin-tutor.models';
import { AdminConfirmDialog } from '../../ui/admin-confirm-dialog';
import { COMMISSION_MAX, COMMISSION_MIN, type ModerationMode, REASON_MAX, commissionIssue, commissionValue, reasonIssue } from '../tutor-moderation.util';

/**
 * Suspend, reinstate, or change the commission of one tutor (P13-26) - one dialog, three modes, because each is "a reason, maybe
 * a number, and a plain-language statement of the consequence" before the confirm button. The reason is kept in the audit trail
 * (a suspension reason is also read by the tutor). The server owns the rules: a status the tutor is not in answers 409
 * `invalid_transition`, a rate outside 0-50 answers 400; the form only spares the round trip. The answer is the tutor as it is now.
 */
@Component({
  selector: 'app-tutor-moderation-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, AdminConfirmDialog, Checkbox, InputField, TutorTextarea],
  templateUrl: './tutor-moderation-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorModerationDialog {
  private readonly api = inject(AdminTutorApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly open = model(false);
  readonly mode = input.required<ModerationMode>();
  readonly tutor = input.required<AdminTutorDetail>();
  readonly done = output<AdminTutorDetail>();

  protected readonly reasonMax = REASON_MAX;
  protected readonly range = { min: COMMISSION_MIN, max: COMMISSION_MAX };
  protected readonly reason = new FormControl('', { nonNullable: true });
  protected readonly percent = new FormControl('', { nonNullable: true });
  protected readonly useDefault = new FormControl(false, { nonNullable: true });
  private readonly reasonValue = toSignal(this.reason.valueChanges.pipe(startWith('')), { requireSync: true });
  private readonly percentValue = toSignal(this.percent.valueChanges.pipe(startWith('')), { requireSync: true });
  private readonly useDefaultValue = toSignal(this.useDefault.valueChanges.pipe(startWith(false)), { requireSync: true });
  protected readonly feedback = new FieldFeedback<'reason' | 'percent'>();

  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly reasonRequired = computed(() => this.mode() !== 'reinstate');
  protected readonly showPercent = computed(() => this.mode() === 'commission' && !this.useDefaultValue());
  protected readonly reasonError = computed(() => {
    const found = reasonIssue(this.reasonValue(), this.reasonRequired());
    return found === undefined ? undefined : this.feedback.messageFor('reason', { reason: found }, this.i18n);
  });
  protected readonly percentError = computed(() => {
    const found = this.showPercent() ? commissionIssue(this.percentValue()) : undefined;
    return found === undefined ? undefined : this.feedback.messageFor('percent', { percent: found }, this.i18n);
  });

  constructor() {
    // Every open starts clean; for a commission change the field starts at the tutor's current override (empty = the default applies).
    effect(() => {
      if (this.open()) {
        untracked(() => {
          const override = this.tutor().commissionPercentOverride;
          this.reason.reset('');
          this.percent.reset(override === null ? '' : String(override));
          this.useDefault.reset(false);
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
    if (reasonIssue(this.reasonValue(), this.reasonRequired()) !== undefined || (this.showPercent() && commissionIssue(this.percentValue()) !== undefined)) {
      return;
    }
    const tutorId = this.tutor().tutorId;
    const reason = this.reasonValue().trim();
    const request$ =
      this.mode() === 'suspend'
        ? this.api.suspend(tutorId, { reason })
        : this.mode() === 'reinstate'
          ? this.api.reinstate(tutorId, { reason: reason.length > 0 ? reason : null })
          : this.api.setCommission(tutorId, { commissionPercentOverride: commissionValue(this.useDefaultValue(), this.percentValue()), reason });
    this.busy.set(true);
    this.problem.set(null);
    request$.subscribe({
      next: (detail) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.success(this.i18n.t(`tutoring.admin.tutors.moderation.${this.mode()}.done`));
        this.done.emit(detail);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.problem.set(this.i18n.t(tutoringAdminErrorKey(error)));
      },
    });
  }
}
