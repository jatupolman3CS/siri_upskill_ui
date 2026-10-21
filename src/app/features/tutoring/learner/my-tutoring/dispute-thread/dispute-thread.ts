import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import type { DisputeMessage } from '../../../data/tutoring-dispute.models';
import { disputeSystemMessageKey } from '../../../data/tutoring-labels';
import { EvidenceLinkList } from '../evidence-link-list/evidence-link-list';

/**
 * The messages of a dispute, oldest first, append-only: nobody can edit or delete one. Who wrote each is spelled out in words
 * ("You", "Tutor", "Support team"), never by colour or side alone. The text is plain text from another person and is rendered as
 * text with line breaks kept. System lines (opened, claimed, decided, withdrawn) carry a short code that is translated here.
 * Messages the other side was not meant to see (administrator notes) are not sent to a learner, so none can appear.
 */
@Component({
  selector: 'app-dispute-thread',
  imports: [TranslatePipe, BangkokDatePipe, EvidenceLinkList],
  templateUrl: './dispute-thread.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DisputeThread {
  readonly messages = input.required<readonly DisputeMessage[]>();

  protected readonly systemKey = disputeSystemMessageKey;

  protected authorKey(message: DisputeMessage): string {
    return message.isMine ? 'tutoring.dispute.thread.you' : `tutoring.dispute.thread.${message.authorRole}`;
  }
}
