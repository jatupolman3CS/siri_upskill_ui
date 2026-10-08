import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorBroadcast, phosphorFilmStrip } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { DeliveryFormat } from '../../../live/data/live.models';
import type { CourseDetailLiveSchedule } from '../../data/course-api.models';

/**
 * Two lines for the price card: when the next live session starts, and how many past sessions can be replayed. Both come
 * from the public `liveSchedule`; a line with nothing to say is left out rather than shown as "0".
 */
@Component({
  selector: 'app-course-live-summary',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorBroadcast, phosphorFilmStrip })],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-2.5 text-xs text-[var(--color-text)]">
      <div class="flex items-center gap-2 font-semibold">
        <ng-icon name="phosphorBroadcast" aria-hidden="true" class="shrink-0 text-sm text-[var(--color-primary)]" />
        <span>{{ 'live.catalog.format.' + format() | translate }}</span>
      </div>
      @if (schedule().nextStartsAtUtc; as nextStart) {
        <p class="text-[var(--color-text-muted)]">
          {{ 'live.catalog.nextSession' | translate: { when: (nextStart | bangkokDate: 'shortDateTime') } }}
          <span>({{ 'live.catalog.bangkokTime' | translate }})</span>
        </p>
      } @else {
        <p class="text-[var(--color-text-muted)]">{{ 'live.catalog.noUpcoming' | translate }}</p>
      }
      @if (replayCount() > 0) {
        <p class="flex items-center gap-2 text-[var(--color-text-muted)]">
          <ng-icon name="phosphorFilmStrip" aria-hidden="true" class="shrink-0 text-sm text-[var(--color-primary)]" />
          {{ 'live.catalog.replayCount' | translate: { count: replayCount() } }}
        </p>
      }
    </div>
  `,
})
export class CourseLiveSummary {
  readonly schedule = input.required<CourseDetailLiveSchedule>();
  readonly format = input<DeliveryFormat>('Live');

  /** Sessions that already finished and have a recording to watch. */
  protected readonly replayCount = computed(
    () => this.schedule().sessions.filter((session) => session.hasRecording).length,
  );
}
