import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorLinkSimple } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { isHttpsUrl } from '../../../../live/data/live-instructor.util';
import type { DisputeMessage, EvidenceLink } from '../../../data/tutoring-dispute.models';
import { disputeSystemMessageKey } from '../../../data/tutoring-labels';

@Component({
  selector: 'app-tutor-dispute-thread',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe],
  templateUrl: './tutor-dispute-thread.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorLinkSimple })],
  host: { class: 'block' },
})
export class TutorDisputeThread {
  readonly messages = input.required<readonly DisputeMessage[]>();

  protected readonly systemKey = disputeSystemMessageKey;

  protected authorKey(message: DisputeMessage): string {
    return message.isMine ? 'tutoring.tutor.disputes.thread.you' : `tutoring.tutor.disputes.thread.${message.authorRole}`;
  }

  protected isSafeLink(link: EvidenceLink): boolean {
    return isHttpsUrl(link.url);
  }
}
