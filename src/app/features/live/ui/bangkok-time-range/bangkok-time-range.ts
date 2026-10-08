import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCalendarBlank } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { utcToBangkokParts } from '../../data/live-instructor.util';

/**
 * "Wed 8 Oct · 10:00–12:00 (Thailand time)" for one session. Every Live time is shown in Asia/Bangkok whatever the viewer's
 * device zone, and says so. A session that runs past Bangkok midnight shows the end's date as well so it is not misread.
 */
@Component({
  selector: 'app-bangkok-time-range',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCalendarBlank })],
  host: { class: 'inline-flex' },
  template: `
    <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <ng-icon name="phosphorCalendarBlank" aria-hidden="true" class="shrink-0" />
      <time [attr.datetime]="startsAtUtc()">{{ startsAtUtc() | bangkokDate: 'weekdayDate' }}</time>
      <span aria-hidden="true">·</span>
      <span>
        <time [attr.datetime]="startsAtUtc()">{{ startsAtUtc() | bangkokDate: 'time' }}</time>–<time [attr.datetime]="endsAtUtc()">{{
          endsAtUtc() | bangkokDate: (crossesMidnight() ? 'shortDateTime' : 'time')
        }}</time>
      </span>
      <span class="text-[var(--color-text-muted)]">({{ 'live.catalog.bangkokTime' | translate }})</span>
    </span>
  `,
})
export class BangkokTimeRange {
  readonly startsAtUtc = input.required<string>();
  readonly endsAtUtc = input.required<string>();

  protected readonly crossesMidnight = computed(() => {
    const start = utcToBangkokParts(this.startsAtUtc());
    const end = utcToBangkokParts(this.endsAtUtc());
    return start !== null && end !== null && start.date !== end.date;
  });
}
