import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorLockKey } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { disputeSystemMessageKey } from '../../../data/tutoring-labels';
import type { AdminDisputeMessage } from '../../data/admin-dispute.models';

/**
 * The whole conversation of a dispute as an administrator sees it (P13-26): the learner's, the tutor's, the administrators' and the
 * system's lines in order. An `Internal` note exists only here - it is boxed, tinted AND carries a lock icon with the words
 * "internal, administrators only", so it can never be mistaken for something the parties can read. A system line arrives as a short
 * code and is translated here. Plain text only; evidence links open in a new tab and show their host first. Presentational only.
 */
@Component({
  selector: 'app-dispute-thread',
  imports: [TranslatePipe, BangkokDatePipe, NgIcon],
  templateUrl: './dispute-thread.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorLockKey })],
})
export class DisputeThread {
  readonly messages = input.required<readonly AdminDisputeMessage[]>();

  protected readonly systemKey = disputeSystemMessageKey;
}
