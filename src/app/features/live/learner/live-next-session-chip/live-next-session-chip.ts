import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorBroadcast, phosphorCalendarBlank, phosphorVideoCamera } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { MyUpcomingSessionItem } from '../../data/live-learner.models';

/**
 * "Next session" strip on a `/my-courses` card (appendix §F, FE-3): when the next session of the course is, or is about
 * to be, live it says so, and offers the join button only while the server says the window is open (`canJoin`). The
 * strip links through to the classroom's Live tab for the full schedule.
 *
 * Presentational only — the parent decides which session to show and refetches when the server's answer can change.
 */
@Component({
  selector: 'app-live-next-session-chip',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe],
  templateUrl: './live-next-session-chip.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  providers: [provideIcons({ phosphorBroadcast, phosphorCalendarBlank, phosphorVideoCamera })],
})
export class LiveNextSessionChip {
  readonly session = input.required<MyUpcomingSessionItem>();

  protected readonly isLive = computed(() => this.session().displayState === 'Live');
  protected readonly liveTabQuery = { tab: 'live' };
}
