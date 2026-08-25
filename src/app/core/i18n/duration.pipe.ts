import { Pipe, PipeTransform, inject } from '@angular/core';

import { TranslationService } from './translation.service';

export type DurationFormat = 'long' | 'compact';

/**
 * Formats a duration given in seconds — course/section totals as words ("long", locale-aware: "2 ชม.
 * 30 นาที" / "2h 30m"), individual episode lengths as a clock ("compact": "12:34", "1:02:34" once past
 * an hour) since a course's syllabus needs to scan quickly and a stopwatch-style number reads faster
 * there than words repeated on every row. `compact` output is locale-independent (digits/colons only),
 * so it's a plain function rather than something that needs `TranslationService` — kept on this one
 * pipe anyway (an argument, not two pipes) since both are "seconds in, duration out" for the same
 * `CourseDetailPage` and picking the right one is a template-level formatting choice, not two distinct
 * concerns.
 * <para>
 * `pure: false`, deliberately — a pure pipe's cache keys strictly on its own *explicit* arguments
 * (`totalSeconds`/`format`, via Angular's `bindingUpdated`), not on any signal merely read inside
 * `transform()`; `course.totalDurationSeconds` doesn't change when the locale toggles, so a `pure:
 * true` version of this pipe would keep rendering the old language until something else forces the
 * binding to re-evaluate (verified empirically, not assumed — this is the same latent bug
 * `CurrencyThbPipe`'s own doc comment claims doesn't exist; that claim doesn't hold either). Re-running
 * `transform()` on every change-detection cycle is the correct trade for a locale-reactive pipe here —
 * this one does no I/O and no expensive work, so the `pure: false` cost is negligible.
 * </para>
 */
@Pipe({ name: 'duration', pure: false })
export class DurationPipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  transform(totalSeconds: number | null | undefined, format: DurationFormat = 'long'): string | null {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
      return null;
    }

    return format === 'compact' ? formatCompact(totalSeconds) : this.formatLong(totalSeconds);
  }

  private formatLong(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return hours > 0
      ? this.translation.t('catalog.duration.hoursAndMinutes', { hours, minutes })
      : this.translation.t('catalog.duration.minutesOnly', { minutes });
  }
}

function formatCompact(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (value: number): string => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
