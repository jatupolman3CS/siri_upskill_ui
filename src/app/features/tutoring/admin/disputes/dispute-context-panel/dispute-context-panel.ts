import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import type { AdminDisputeDetail } from '../../data/admin-dispute.models';
import { tutorStatusView } from '../../data/admin-labels';
import type { TutorStatus } from '../../../data/tutoring-tutor.models';
import { AdminChip } from '../../ui/admin-chip';

/**
 * The evidence an administrator weighs besides the parties' words (P13-26): who joined the room and when, what the attendance
 * check decided and on what evidence, how the class was paid and what was already refunded, and the tutor's record (state,
 * reliability, rating, penalties, and how their other disputes went in the last 90 days) with a way to open the tutor. Every
 * figure is the server's; this component adds nothing up and decides nothing. Presentational only.
 */
@Component({
  selector: 'app-dispute-context-panel',
  imports: [RouterLink, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, AdminChip],
  templateUrl: './dispute-context-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class DisputeContextPanel {
  private readonly i18n = inject(TranslationService);

  readonly detail = input.required<AdminDisputeDetail>();

  /** The label of a value the dictionary knows; a value this client has never seen (the API sends plain strings here) is shown as it came. */
  protected labelOf(prefix: string, value: string): string {
    const key = `${prefix}.${value}`;
    const text = this.i18n.t(key);
    return text === key ? value : text;
  }

  /** The tutor's state as a chip when it is one this client knows; an unknown value is shown as text by the template. */
  protected tutorChip(status: string) {
    return (['Draft', 'PendingVerification', 'NeedsInfo', 'Verified', 'Rejected', 'Suspended'] as readonly string[]).includes(status) ? tutorStatusView(status as TutorStatus) : null;
  }
}
