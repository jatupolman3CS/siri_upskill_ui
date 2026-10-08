import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretRight, phosphorUsers, phosphorWarning } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { BangkokTimeRange } from '../../../live/ui/bangkok-time-range/bangkok-time-range';
import { LiveStatusBadge } from '../../../live/learner/live-status-badge/live-status-badge';
import type { InstructorLiveAttendanceItem, InstructorNextSession } from '../../analytics/instructor-analytics.service';

/**
 * "Next live session" and "Recent attendance". Both read straight from the summary: no next session (or no past sessions)
 * is said plainly instead of being padded with sample rows. A next session whose room is not usable carries a warning and
 * a link to its page — the one place the instructor can fix that.
 */
@Component({
  selector: 'app-dashboard-live-cards',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, BangkokTimeRange, LiveStatusBadge],
  templateUrl: './dashboard-live-cards.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretRight, phosphorUsers, phosphorWarning })],
  host: { class: 'block' },
})
export class DashboardLiveCards {
  readonly nextSession = input<InstructorNextSession | null>(null);
  readonly attendance = input<readonly InstructorLiveAttendanceItem[]>([]);

  /** Bar fill 0..1 — only for display; the percentage text is what carries the meaning. */
  protected fill(item: InstructorLiveAttendanceItem): number {
    const percent = item.attendanceRatePercent;
    return percent === null ? 0 : Math.min(1, Math.max(0, percent / 100));
  }
}
