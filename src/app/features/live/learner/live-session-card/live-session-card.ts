import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCalendarBlank,
  phosphorCalendarPlus,
  phosphorCheckCircle,
  phosphorClock,
  phosphorHourglass,
  phosphorPlayCircle,
  phosphorVideoCamera,
  phosphorWarning,
} from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import type { MySessionItem } from '../../data/live-learner.models';
import type { Guid } from '../../data/live.models';
import { LiveCountdown } from '../live-countdown/live-countdown';
import { LiveStatusBadge } from '../live-status-badge/live-status-badge';

/**
 * One live session in the classroom's "Live" tab. Purely presentational: it renders what the server decided
 * (`displayState`, `canJoin`, `roomReady`) and reports intent through outputs — it never derives a state of its own and
 * never talks to the API.
 */
@Component({
  selector: 'app-live-session-card',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, LiveStatusBadge, LiveCountdown],
  templateUrl: './live-session-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  providers: [
    provideIcons({
      phosphorCalendarBlank,
      phosphorCalendarPlus,
      phosphorCheckCircle,
      phosphorClock,
      phosphorHourglass,
      phosphorPlayCircle,
      phosphorVideoCamera,
      phosphorWarning,
    }),
  ],
})
export class LiveSessionCard {
  readonly session = input.required<MySessionItem>();
  readonly courseSlug = input.required<string>();
  /** `serverNow - deviceNow` in ms, so the countdown follows the server's clock. */
  readonly offsetMs = input(0);
  /** `true` while this session's `.ics` file is being fetched. */
  readonly calendarBusy = input(false);

  readonly join = output<Guid>();
  readonly addToCalendar = output<Guid>();

  protected readonly isCancelled = computed(() => this.session().displayState === 'Cancelled');
  protected readonly isEnded = computed(() => this.session().displayState === 'Ended');
  protected readonly isUpcoming = computed(() => this.session().displayState === 'Upcoming');
  protected readonly isLive = computed(() => this.session().displayState === 'Live');

  /** Calendar files only exist for sessions that have not finished or been cancelled (the API answers 409 otherwise). */
  protected readonly canAddToCalendar = computed(() => this.isUpcoming() || this.isLive());

  protected onJoin(): void {
    const session = this.session();
    // The button is disabled unless the server said `canJoin`, but a disabled control is not a security boundary:
    // guard here too so the output can never fire for a session the server has not opened.
    if (session.canJoin) {
      this.join.emit(session.id);
    }
  }
}
