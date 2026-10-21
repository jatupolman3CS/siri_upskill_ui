import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { Modal } from '../../../../shared/modal/modal';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';

/**
 * "Are you sure?" step for an administrator action that cannot be undone (decide a case, suspend a tutor, ...). The caller
 * projects a plain-language description of WHAT WILL HAPPEN into the body and owns the request; this component owns the
 * double-submit guard (the confirm button is disabled and shows progress while `busy`) and the failure banner. Destructive, so a
 * click on the backdrop never dismisses it (Escape and the X still do; a request already in flight is not cancelled by that, and
 * the caller applies its outcome either way).
 */
@Component({
  selector: 'app-admin-confirm-dialog',
  imports: [TranslatePipe, Button, Modal, TutorProblem],
  template: `
    <app-modal [(open)]="open" [titleText]="titleText()" [closeOnOverlayClick]="false">
      <div class="flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-1">
        <ng-content />
        <app-tutor-problem [message]="problem()" />
      </div>
      <div modalFooter class="flex flex-wrap justify-end gap-3">
        <app-button variant="secondary" [disabled]="busy()" (click)="open.set(false)">{{ cancelLabel() ?? ('tutoring.admin.common.back' | translate) }}</app-button>
        <app-button [variant]="danger() ? 'danger' : 'primary'" [loading]="busy()" [disabled]="busy()" (click)="confirm()">{{ confirmLabel() }}</app-button>
      </div>
    </app-modal>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConfirmDialog {
  readonly open = model(false);
  readonly titleText = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input<string | null>(null);
  readonly danger = input(false);
  /** The request is in flight: the confirm button shows progress and cannot be pressed again. */
  readonly busy = input(false);
  /** The translated failure of the last attempt; `null` hides the banner. */
  readonly problem = input<string | null>(null);

  readonly confirmed = output<void>();

  protected confirm(): void {
    if (!this.busy()) {
      this.confirmed.emit();
    }
  }
}
