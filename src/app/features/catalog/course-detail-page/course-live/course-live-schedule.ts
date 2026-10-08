import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorFilmStrip, phosphorLockKey } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { DeliveryFormat } from '../../../live/data/live.models';
import { LiveStatusBadge } from '../../../live/learner/live-status-badge/live-status-badge';
import { BangkokTimeRange } from '../../../live/ui/bangkok-time-range/bangkok-time-range';
import type { CourseDetailLiveSchedule } from '../../data/course-api.models';

/** Sessions shown before "show more" — a course can run dozens of sessions and the page must stay scannable. */
const INITIAL_VISIBLE = 8;

/**
 * The public live schedule of a Live / Hybrid course, from `liveSchedule` on the course detail response — no call to the
 * Live module and, by design, no room link: the link is only ever released to an enrolled learner at join time. Every time
 * is shown in Asia/Bangkok and says so; each session's state (upcoming / live / ended / cancelled) is the server's.
 */
@Component({
  selector: 'app-course-live-schedule',
  imports: [NgIcon, TranslatePipe, LiveStatusBadge, BangkokTimeRange],
  templateUrl: './course-live-schedule.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorFilmStrip, phosphorLockKey })],
  host: { class: 'block' },
})
export class CourseLiveSchedule {
  readonly schedule = input.required<CourseDetailLiveSchedule>();
  readonly format = input<DeliveryFormat>('Live');

  protected readonly expanded = signal(false);
  protected readonly visibleSessions = computed(() => {
    const sessions = this.schedule().sessions;
    return this.expanded() ? sessions : sessions.slice(0, INITIAL_VISIBLE);
  });
  protected readonly hiddenCount = computed(() => Math.max(0, this.schedule().sessions.length - INITIAL_VISIBLE));

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }
}
