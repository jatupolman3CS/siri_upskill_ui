import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorGear, phosphorHourglass, phosphorNotePencil, phosphorUsersThree, phosphorVideoCamera, phosphorXCircle } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import { clockOffsetMs, msUntil } from '../../../../live/learner/live-clock';
import { LiveCountdown } from '../../../../live/learner/live-countdown/live-countdown';
import { BangkokTimeRange } from '../../../../live/ui/bangkok-time-range/bangkok-time-range';
import { isKnownSessionStatus, listedRoomView, roomNeedsTutor, sessionStatusView } from '../../../data/tutor-class-view.util';
import type { Guid, IsoUtc, TutorClassListItem } from '../../../data/tutoring-classes.models';
import { formatLabelKey, gradeLabelKey, localizedName } from '../../../data/tutoring-labels';
import { bookingStatusKeyOf } from '../../../data/tutoring-tutor-labels';

/**
 * One class in the tutor's list (P13-25, contract P13-10 section 7.5). Everything it offers comes from the flags the SERVER computed on its own
 * clock: "Start class" is live only while `canStart`, "Finish class" only while `canComplete` - otherwise the button is off and the card says why
 * (when the action opens, from `startOpensAtUtc` / `completeOpensAtUtc`; or that no learner has joined yet, from `learnerPresent`). Both buttons lead to
 * the class page, which is where the start / complete calls are made and where the server's verdict is shown; a flag is a hint, not a permission.
 * A tutor who is suspended gets `false` for both, so nothing here needs to know why. `needsSummary` and the room's `needsAction` point the tutor at what
 * is waiting for them. A countdown that reaches zero tells the list to read again, so the flags are the server's again. Cancelling is offered for a
 * `Scheduled` class and opens the cancellation dialog, which asks the server what it would cost before anything is confirmed.
 */
@Component({
  selector: 'app-tutor-class-card',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, StatusChip, BangkokTimeRange, LiveCountdown],
  templateUrl: './tutor-class-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorGear, phosphorHourglass, phosphorNotePencil, phosphorUsersThree, phosphorVideoCamera, phosphorXCircle })],
  host: { class: 'block' },
})
export class TutorClassCard {
  private readonly i18n = inject(TranslationService);

  readonly item = input.required<TutorClassListItem>();
  /** The tutor asked to cancel this class: the list opens the cancellation dialog for it. */
  readonly cancelRequested = output<Guid>();
  /** A countdown on this card reached zero on the server clock: the list should read again. */
  readonly windowReached = output<void>();

  protected readonly formatKey = formatLabelKey;
  protected readonly gradeKey = gradeLabelKey;
  protected readonly bookingStatusKey = bookingStatusKeyOf;

  protected readonly subject = computed(() => {
    const offering = this.item().offering;
    return localizedName({ nameTh: offering.subjectNameTh, nameEn: offering.subjectNameEn }, this.i18n.locale());
  });
  /** A status this client does not know yet falls back to the neutral "closed" look rather than a wrong state. */
  protected readonly statusView = computed(() => sessionStatusView(isKnownSessionStatus(this.item().status) ? this.item().status : 'Cancelled'));
  protected readonly isScheduled = computed(() => this.item().status === 'Scheduled');
  protected readonly titleId = computed(() => `tutor-class-${this.item().sessionId}`);

  /** `serverNow - deviceNow`, taken from the response, so a wrong device clock does not move the countdowns. */
  protected readonly offsetMs = computed(() => clockOffsetMs(this.item().serverTimeUtc));
  /** When starting opens, while it is still ahead and the server has not (yet) said `canStart`. */
  protected readonly startsAt = computed<IsoUtc | null>(() => this.pendingOpening(this.item().canStart, this.item().startOpensAtUtc));
  protected readonly completesAt = computed<IsoUtc | null>(() => this.pendingOpening(this.item().canComplete, this.item().completeOpensAtUtc));
  protected readonly waitingForLearner = computed(() => this.isScheduled() && !this.item().canComplete && !this.item().learnerPresent);

  protected readonly roomView = computed(() => {
    const room = this.item().room;
    return room !== null && this.isScheduled() ? listedRoomView(room) : null;
  });
  protected readonly roomNeedsTutor = computed(() => {
    const room = this.item().room;
    return room !== null && this.isScheduled() && roomNeedsTutor(room.needsAction);
  });
  /** The seats of a group class (`null` for one-on-one): held seats include unpaid holds, as the server counts them. */
  protected readonly seats = computed(() => {
    const { format, seatsTaken, capacity } = this.item();
    return format === 'Group' && seatsTaken !== null && capacity !== null ? { taken: seatsTaken, capacity } : null;
  });

  /** The class page, where the tutor starts, completes, fixes the room or writes the summary. */
  protected readonly classLink = computed(() => ['/instructor/tutoring/classes', this.item().sessionId]);

  private pendingOpening(allowed: boolean, opensAtUtc: IsoUtc | null): IsoUtc | null {
    if (allowed || opensAtUtc === null || !this.isScheduled()) {
      return null;
    }
    const remaining = msUntil(opensAtUtc, this.offsetMs());
    return remaining !== null && remaining > 0 ? opensAtUtc : null;
  }
}
