import type { CreatePayoutBatchRequest } from '../../payout/data/payout-api.models';

/**
 * Pure logic of the "create payout round" dialog: which kinds of round exist and how the period key of each is written.
 * Mirrors `CreatePayoutBatchCommand` / `CreatePayoutBatchValidator` (`Siri.Modules.Payout/Application/PayoutBatchModels.cs`) and
 * `IsoWeekKey`: a `Course` round is the monthly run keyed `YYYY-MM`; a `Tutoring` round is the weekly run keyed by an ISO-8601 week
 * `YYYY-Www` counted in Thai local time (UTC+7, no daylight saving). The server re-validates every key and its answer always wins -
 * the checks here only spare the admin a round trip for a typo.
 */

/** The `sourceType` values `POST /api/payout/admin/batches` accepts (exact names; absent also means `Course`). */
export type PayoutRoundType = NonNullable<CreatePayoutBatchRequest['sourceType']>;
export const PAYOUT_ROUND_TYPES: readonly PayoutRoundType[] = ['Course', 'Tutoring'];

/** `PayoutBatchModels.cs` `PeriodKeyPattern`: a month, `2026-08`. */
const COURSE_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
/** `IsoWeekKey.Shape`: an ISO week, `2026-W41` (upper-case `W`, two digits). */
const WEEK_KEY = /^(\d{4})-W(\d{2})$/;
/** `IsoWeekKey.MinYear` / `MaxYear`. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2999;

const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

interface IsoWeek {
  readonly year: number;
  readonly week: number;
}

/** The ISO week of the calendar date held in the UTC fields of `date` (so a Bangkok wall-clock reading is passed as a shifted instant). */
function isoWeekOfCalendarDate(date: Date): IsoWeek {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // The Thursday of the date's ISO week decides which week-year the week belongs to (2027-01-01 is still 2026-W53).
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7) + 3);
  const year = day.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const jan4DayIndex = (new Date(jan4).getUTCDay() + 6) % 7;
  return { year, week: 1 + Math.round(((day.getTime() - jan4) / MS_PER_DAY + jan4DayIndex - 3) / 7) };
}

const weeksInIsoYear = (year: number): number => isoWeekOfCalendarDate(new Date(Date.UTC(year, 11, 28))).week;

const formatWeekKey = ({ year, week }: IsoWeek): string => `${year}-W${String(week).padStart(2, '0')}`;

/** The ISO week key (Thai local time) of the instant `nowMs` - `2026-W41`. */
export function isoWeekKeyAt(nowMs: number): string {
  return formatWeekKey(isoWeekOfCalendarDate(new Date(nowMs + BANGKOK_OFFSET_MS)));
}

/** The last `count` ISO week keys ending with the week that contains `nowMs`, newest first - what the dialog offers as quick picks. */
export function recentIsoWeekKeys(nowMs: number, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => isoWeekKeyAt(nowMs - index * MS_PER_WEEK));
}

/** The month key `YYYY-MM` of `now` in the browser's own calendar (the original behaviour of the dialog). */
export function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The key the dialog starts on. A course round starts on the current month; a tutoring round on the week that just ended, because a
 * weekly round takes what became releasable by the end of its own week (the week in progress is still a quick pick).
 */
export function defaultPeriodKey(type: PayoutRoundType, nowMs: number): string {
  return type === 'Tutoring' ? isoWeekKeyAt(nowMs - MS_PER_WEEK) : currentMonthKey(new Date(nowMs));
}

export type PeriodKeyIssue = 'required' | 'invalid';

/** What is wrong with `key` for this kind of round, or `null` when it is well-formed (a week must exist: week 53 only in a year that has one). */
export function periodKeyIssue(type: PayoutRoundType, key: string): PeriodKeyIssue | null {
  const value = key.trim();
  if (value === '') {
    return 'required';
  }
  if (type === 'Course') {
    return COURSE_KEY.test(value) ? null : 'invalid';
  }
  const match = WEEK_KEY.exec(value);
  if (match === null) {
    return 'invalid';
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  return year >= MIN_YEAR && year <= MAX_YEAR && week >= 1 && week <= weeksInIsoYear(year) ? null : 'invalid';
}
