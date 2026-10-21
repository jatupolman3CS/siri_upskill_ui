import { CurrencyPipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorUsersThree, phosphorVideoCamera } from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { MediaUrlPipe } from '../../../../../core/pipes/media-url.pipe';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import { LiveCountdown } from '../../../../live/learner/live-countdown/live-countdown';
import { BangkokTimeRange } from '../../../../live/ui/bangkok-time-range/bangkok-time-range';
import { formatLabelKey, gradeLabelKey, localizedName } from '../../../data/tutoring-labels';
import type { BookingListItem } from '../../../data/tutoring-learner.models';
import { bookingStatusView, joinCue, joinRoute } from '../../../data/tutoring-my.util';
import { formatTutorDisplayName } from '../tutor-display-name.util';

/**
 * One lesson in the "My tutoring" list. Everything on it is what the server sent: the status, the price, the join hint and the
 * join window. The card never works out an entitlement or an amount - it picks wording, and the join button leads to the join
 * page, which asks the server again before any room link is shown. While the join window has not opened the card counts down on
 * the server-corrected clock (`offsetMs`) and tells the list to refetch when it reaches zero, so the server's `canJoin` is current.
 */
@Component({
  selector: 'app-booking-card',
  imports: [RouterLink, NgIcon, NgOptimizedImage, TranslatePipe, CurrencyThbPipe, MediaUrlPipe, StatusChip, LiveCountdown, BangkokTimeRange],
  templateUrl: './booking-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorUsersThree, phosphorVideoCamera })],
  host: { class: 'block' },
})
export class BookingCard {
  private readonly i18n = inject(TranslationService);

  readonly booking = input.required<BookingListItem>();
  /** `serverNow - deviceNow` in ms, from the list's `serverTimeUtc`. */
  readonly offsetMs = input(0);
  /** The join window of this card has just opened on the server clock: the list should read again. */
  readonly joinWindowReached = output<void>();

  protected readonly formatKey = formatLabelKey;
  protected readonly gradeKey = gradeLabelKey;
  protected readonly statusView = computed(() => bookingStatusView(this.booking().status));
  protected readonly subject = computed(() =>
    localizedName({ nameTh: this.booking().offering.subjectNameTh, nameEn: this.booking().offering.subjectNameEn }, this.i18n.locale()),
  );
  protected readonly cue = computed(() => joinCue(this.booking(), Date.now() + this.offsetMs()));
  protected readonly joinLink = computed(() => joinRoute(this.booking().sessionId));
  protected readonly tutorName = computed(() => formatTutorDisplayName(this.booking().tutor, this.i18n));
  protected readonly initial = computed(() => this.tutorName().trim().charAt(0).toUpperCase());
  protected readonly isFree = computed(() => this.booking().priceAmount === 0);
  protected readonly titleId = computed(() => `my-booking-${this.booking().bookingId}`);
}
