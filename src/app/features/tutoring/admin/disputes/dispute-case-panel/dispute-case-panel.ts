import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { disputeHintKey } from '../../data/admin-labels';
import type { AdminDisputeDetail } from '../../data/admin-dispute.models';

/**
 * What was reported (P13-26): the opener's description, the class it is about, the learner as an administrator may know them (a
 * nickname and a school grade - never a guardian's contact), the evidence links the parties attached and the server's hints.
 * Links open in a new tab with `noopener noreferrer nofollow` and show their host first; the server never fetched them.
 * Presentational only.
 */
@Component({
  selector: 'app-dispute-case-panel',
  imports: [TranslatePipe, BangkokDatePipe],
  templateUrl: './dispute-case-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisputeCasePanel {
  private readonly i18n = inject(TranslationService);

  readonly detail = input.required<AdminDisputeDetail>();

  protected readonly subject = computed(() => {
    const session = this.detail().session;
    return this.i18n.locale() === 'th' ? session.subjectNameTh : session.subjectNameEn;
  });
  protected readonly hintKeys = computed(() => this.detail().hints.map(disputeHintKey).filter((key): key is string => key !== null));
  /** A grade the dictionary knows is translated; anything else is shown as the server sent it. */
  protected readonly grade = computed(() => {
    const level = this.detail().learner.gradeLevel;
    const key = `tutoring.enums.grade.${level}`;
    const text = this.i18n.t(key);
    return text === key ? level : text;
  });
}
