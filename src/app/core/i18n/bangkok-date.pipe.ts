import { formatDate } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';

import { TranslationService } from './translation.service';

export type BangkokDateFormat = 'dateTime' | 'date' | 'time' | 'shortDateTime' | 'weekdayDate' | 'month';

const FORMATS: Record<BangkokDateFormat, string> = {
  dateTime: 'd MMM yyyy HH:mm',
  date: 'd MMM yyyy',
  time: 'HH:mm',
  shortDateTime: 'd MMM HH:mm',
  weekdayDate: 'EEE d MMM',
  month: 'MMMM yyyy',
};

/**
 * Thailand is UTC+7 with no daylight saving (and has been since 1920), so a fixed `+0700` offset is exact for every
 * instant. Angular's date formatting only understands `UTC` / numeric offsets — an IANA name such as `Asia/Bangkok` is
 * silently ignored and the browser's own zone is used instead, which is the bug this pipe exists to prevent.
 */
const BANGKOK_OFFSET = '+0700';

/**
 * Renders an API instant (ISO-8601 UTC, e.g. `2026-10-01T03:00:00Z`) in Asia/Bangkok wall-clock time, in the locale
 * picked in `TranslationService`. The platform shows every live-session time this way regardless of the viewer's
 * device zone (appendix: "FE แปลงเป็น `Asia/Bangkok` ที่ pipe เดียว").
 * <para>
 * Returns `string`, never `null`: empty or unparseable input renders as an empty string, so the result can be used
 * directly as an interpolation param (`translate: { date: (x | bangkokDate) }`) without a `?? ''` at every call site.
 * </para>
 * <para>
 * `pure: false`, deliberately — same reason as `TranslatePipe`/`DurationPipe`: a pure pipe only re-runs when its own
 * explicit arguments change, not when the locale signal it reads inside `transform()` does, so a pure version would keep
 * the previous language after the TH/EN toggle. This does no I/O, so re-running per change-detection pass is cheap.
 * </para>
 */
@Pipe({ name: 'bangkokDate', pure: false })
export class BangkokDatePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  transform(value: string | null | undefined, format: BangkokDateFormat = 'dateTime'): string {
    if (!value) {
      return '';
    }
    const locale = this.translation.locale() === 'th' ? 'th-TH' : 'en-US';
    try {
      return formatDate(value, FORMATS[format], locale, BANGKOK_OFFSET);
    } catch {
      // Unparseable input: show nothing rather than a misleading value or a template crash.
      return '';
    }
  }
}
