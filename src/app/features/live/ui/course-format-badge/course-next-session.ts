import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

/** "Next session: 8 Oct 10:00" for a course card — nothing when there is no upcoming session. Bangkok time. */
@Component({
  selector: 'app-course-next-session',
  imports: [TranslatePipe, BangkokDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (startsAtUtc(); as start) {
      <p class="text-sm text-[var(--color-text-muted)]">
        {{ 'live.catalog.nextSession' | translate: { when: (start | bangkokDate: 'shortDateTime') } }}
      </p>
    }
  `,
})
export class CourseNextSession {
  readonly startsAtUtc = input<string | null | undefined>(null);
}
