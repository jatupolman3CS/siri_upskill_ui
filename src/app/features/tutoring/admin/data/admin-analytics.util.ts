import { formatDate } from '@angular/common';
import type { ResourceRef } from '@angular/core';

import type { Locale } from '../../../../core/i18n/translation.service';
import { addDaysToDate } from '../../../live/data/live-instructor.util';
import { daysBetweenDates } from '../../data/tutor-slots.util';
import type { AnalyticsGranularity, FunnelSegment, LocalDate, TopTutorSort } from './admin-analytics.models';

/**
 * Pure helpers of the administrator analytics screen. None of them computes a report figure: they read and validate what is in the address
 * bar, build the default period, check a period against the limits the contract states (the server checks them again and its answer wins),
 * and turn numbers the server sent into a bar width or a label.
 */

export const GRANULARITIES: readonly AnalyticsGranularity[] = ['Day', 'Week', 'Month'];
export const FUNNEL_SEGMENTS: readonly FunnelSegment[] = ['All', 'Trial', 'Paid'];
export const TOP_TUTOR_SORTS: readonly TopTutorSort[] = ['Completed', 'Booked', 'Rating'];
/** How many rows the "top" lists may ask for (the contract's `top` is 1 to 50). */
export const TOP_COUNTS: readonly number[] = [10, 20, 50];
export const DEFAULT_TOP = 20;
export const MAX_TOP = 50;

export const REPORT_TABS = ['revenue', 'search', 'retention', 'funnel', 'tutors', 'kyc'] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

/** The default period of every report with a date range, ending today: the last 30 days. */
export const DEFAULT_RANGE_DAYS = 30;
/** The default span of the retention report: the last 12 months. */
export const DEFAULT_RETENTION_MONTHS = 12;
/** How many months back the retention month pickers reach (the contract allows a span of at most 24). */
export const RETENTION_MAX_MONTHS = 24;

/** Range limits stated by P13-15 section 5. `null` = the contract states none for this report (the server decides). */
export type RangeUnit = 'days' | 'weeks' | 'months';
export interface RangeLimit {
  readonly unit: RangeUnit;
  readonly max: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `value` when it is a real calendar day written `yyyy-MM-dd`, else `null`. */
export function parseIsoDate(value: string | null): LocalDate | null {
  return value !== null && DATE_PATTERN.test(value) && addDaysToDate(value, 0) === value ? value : null;
}

/** `value` when it is a month written `yyyy-MM`, else `null`. */
export function parseMonth(value: string | null): string | null {
  return value !== null && MONTH_PATTERN.test(value) ? value : null;
}

export function parseTop(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_TOP ? parsed : DEFAULT_TOP;
}

/** `{ from, to }` ending `today` and covering `days` days (today included). */
export function defaultRange(today: LocalDate, days = DEFAULT_RANGE_DAYS): { readonly from: LocalDate; readonly to: LocalDate } {
  return { from: addDaysToDate(today, -(days - 1)) ?? today, to: today };
}

/** The month of a `yyyy-MM-dd` day, or the month shifted by `delta` whole months. */
export function monthOf(date: LocalDate, delta = 0): string {
  const year = Number(date.slice(0, 4));
  const index = Number(date.slice(5, 7)) - 1 + delta;
  const shifted = new Date(Date.UTC(year, index, 1));
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function defaultMonths(today: LocalDate): { readonly fromMonth: string; readonly toMonth: string } {
  return { fromMonth: monthOf(today, -(DEFAULT_RETENTION_MONTHS - 1)), toMonth: monthOf(today) };
}

/** The months a retention picker offers, newest first. */
export function monthOptions(today: LocalDate, count = RETENTION_MAX_MONTHS): readonly string[] {
  return Array.from({ length: count }, (_, index) => monthOf(today, -index));
}

/** "October 2026" in the language picked in the header; the month is a Thailand-time month, so the label is the same on every device. */
export function monthLabel(month: string, locale: Locale): string {
  try {
    return formatDate(`${month}-15T05:00:00Z`, 'MMMM yyyy', locale === 'th' ? 'th-TH' : 'en-US', '+0700');
  } catch {
    return month;
  }
}

/** A UTC instant inside the given Thailand day (noon), so the shared date pipe prints that day whatever the device's time zone. */
export function bucketInstant(date: LocalDate): string {
  return `${date}T05:00:00Z`;
}

// --- Limits ---------------------------------------------------------------------------------------------------------------------

/** The range limit of a report (P13-15 section 5), or `null` where the contract names none. */
export function rangeLimitOf(tab: ReportTab, granularity: AnalyticsGranularity): RangeLimit | null {
  switch (tab) {
    case 'revenue':
      return granularity === 'Day' ? { unit: 'days', max: 92 } : granularity === 'Week' ? { unit: 'weeks', max: 53 } : { unit: 'months', max: 24 };
    case 'search':
      return { unit: 'days', max: 90 };
    case 'tutors':
      return { unit: 'days', max: 366 };
    default:
      return null;
  }
}

export type RangeIssue =
  | { readonly code: 'incomplete' }
  | { readonly code: 'order' }
  | { readonly code: 'future' }
  | { readonly code: 'tooLong'; readonly unit: RangeUnit; readonly max: number };

/** Whole months between two `yyyy-MM-dd` days, counted by calendar month (the same month = 0). */
function monthsBetween(from: LocalDate, to: LocalDate): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

/**
 * What is wrong with a period, if anything: it must be two real days, in order, not after today, and within the report's limit. Only the
 * limits the contract states are checked; the server checks them again and says which one it applied.
 */
export function rangeIssueOf(from: string | null, to: string | null, today: LocalDate, limit: RangeLimit | null): RangeIssue | null {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (start === null || end === null) {
    return { code: 'incomplete' };
  }
  if (start > end) {
    return { code: 'order' };
  }
  if (end > today) {
    return { code: 'future' };
  }
  if (limit === null) {
    return null;
  }
  const days = daysBetweenDates(start, end) + 1;
  const span = limit.unit === 'days' ? days : limit.unit === 'weeks' ? days / 7 : monthsBetween(start, end) + 1;
  return span > limit.max ? { code: 'tooLong', unit: limit.unit, max: limit.max } : null;
}

/** What is wrong with a retention month range: in order, not after this month, and at most 24 months. */
export function monthIssueOf(fromMonth: string | null, toMonth: string | null, today: LocalDate): RangeIssue | null {
  const start = parseMonth(fromMonth);
  const end = parseMonth(toMonth);
  if (start === null || end === null) {
    return { code: 'incomplete' };
  }
  if (start > end) {
    return { code: 'order' };
  }
  if (end > monthOf(today)) {
    return { code: 'future' };
  }
  return monthsBetween(`${start}-01`, `${end}-01`) + 1 > RETENTION_MAX_MONTHS ? { code: 'tooLong', unit: 'months', max: RETENTION_MAX_MONTHS } : null;
}

// --- Display --------------------------------------------------------------------------------------------------------------------

/** The width (0 to 100) of a bar for `value` against the largest value on screen. Decoration only: the value is always written next to its bar. */
export function percentOf(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((Math.abs(value) / max) * 100)));
}

/** The largest absolute value of a list (the scale of its bars); 0 for an empty list. */
export function maxAbsOf(values: readonly number[]): number {
  return values.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
}

/** A rate `0..1` as `42.5%`; `null` stays `null` so the screen can say "not enough data" instead of "0%". */
export function formatPercent(rate: number | null): string | null {
  if (rate === null || !Number.isFinite(rate)) {
    return null;
  }
  return `${Math.round(rate * 1000) / 10}%`;
}

// --- Fetch state ----------------------------------------------------------------------------------------------------------------

/** What a report shows: a busy skeleton, an error with a retry, or its content. */
export type ReportStatus = 'loading' | 'error' | 'ready';

/**
 * The status of a report's resource. A report that has a value stays `ready` while it is read again (a refresh keeps the old figures on screen
 * until the new ones arrive), and a failed read is always `error` - the value of a resource in its error state is never read.
 */
export function reportStatusOf(resource: Pick<ResourceRef<unknown>, 'status' | 'hasValue'>): ReportStatus {
  if (resource.status() === 'error') {
    return 'error';
  }
  return resource.hasValue() ? 'ready' : 'loading';
}

// --- The address bar ------------------------------------------------------------------------------------------------------------

/** Everything the screen's controls can change; each report reads the part it needs. All of it lives in the URL, so Back and a shared link land on the same view. */
export interface AnalyticsFilters {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly granularity: AnalyticsGranularity;
  readonly segment: FunnelSegment;
  readonly sort: TopTutorSort;
  readonly top: number;
  readonly fromMonth: string;
  readonly toMonth: string;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

/**
 * Reads the filters out of the query string. Every value is validated - a hand-edited URL never reaches the API as an unknown enum value, a
 * malformed date or an out-of-range count - and what is missing falls back to the default period (the last 30 days, the last 12 months).
 */
export function parseFilters(get: (key: string) => string | null, today: LocalDate): AnalyticsFilters {
  const fallback = defaultRange(today);
  let from = parseIsoDate(get('from'));
  let to = parseIsoDate(get('to'));
  if (from !== null && to === null) {
    to = today;
  } else if (from === null && to !== null) {
    from = addDaysToDate(to, -(DEFAULT_RANGE_DAYS - 1)) ?? fallback.from;
  } else if (from === null || to === null) {
    from = fallback.from;
    to = fallback.to;
  }
  const months = defaultMonths(today);
  return {
    from: from ?? fallback.from,
    to: to ?? fallback.to,
    granularity: oneOf(get('granularity'), GRANULARITIES, 'Day'),
    segment: oneOf(get('segment'), FUNNEL_SEGMENTS, 'All'),
    sort: oneOf(get('sort'), TOP_TUTOR_SORTS, 'Completed'),
    top: parseTop(get('top')),
    fromMonth: parseMonth(get('fromMonth')) ?? months.fromMonth,
    toMonth: parseMonth(get('toMonth')) ?? months.toMonth,
  };
}

/** The tab named in `?tab=`, or the first one. */
export function parseTab(value: string | null): ReportTab {
  return oneOf(value, REPORT_TABS, 'revenue');
}
