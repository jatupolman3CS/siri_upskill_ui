import { addDaysToDate, bangkokToUtcIso, utcToBangkokParts } from '../../live/data/live-instructor.util';
import type { IsoUtc, TutorSlot } from './tutoring-public.models';

const DAY_MS = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

/** One calendar day (Asia/Bangkok) of the slot picker with the slots that start on it. */
export interface SlotDay {
  /** `YYYY-MM-DD`, Bangkok calendar date. */
  readonly date: string;
  /** A UTC instant inside that Bangkok day (noon) - only used to render the weekday / day number through `bangkokDate`. */
  readonly noonUtc: IsoUtc;
  readonly slots: readonly TutorSlot[];
}

/** The calendar date in Asia/Bangkok (`YYYY-MM-DD`) of an explicit clock reading, so it is testable. */
export function bangkokDateOf(nowMs: number): string {
  return new Date(nowMs + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Bangkok calendar date of a UTC instant, or `null` when it is unparseable. */
export function bangkokDateOfInstant(iso: IsoUtc): string | null {
  return utcToBangkokParts(iso)?.date ?? null;
}

/** `[fromUtc, toUtc)` covering `dayCount` whole Bangkok days from `startDate` (inclusive) - the query range of the slots call. */
export function slotWindowRange(startDate: string, dayCount: number): { readonly fromUtc: IsoUtc; readonly toUtc: IsoUtc } | null {
  const endDate = addDaysToDate(startDate, dayCount);
  const fromUtc = bangkokToUtcIso(startDate, '00:00');
  const toUtc = endDate === null ? null : bangkokToUtcIso(endDate, '00:00');
  return fromUtc === null || toUtc === null ? null : { fromUtc, toUtc };
}

/** Whole days between two `YYYY-MM-DD` dates (`to - from`); 0 when either is unparseable. */
export function daysBetweenDates(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) / DAY_MS);
}

/**
 * Buckets `slots` into `dayCount` consecutive Bangkok days starting at `startDate`. Days with no slots are kept (they are
 * still tabs - an empty day is information, not an absence). Slots that start outside the window are ignored; the server
 * already ordered the input by start time, which the buckets preserve.
 */
export function buildSlotDays(startDate: string, dayCount: number, slots: readonly TutorSlot[]): readonly SlotDay[] {
  const days: SlotDay[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDaysToDate(startDate, offset);
    const noonUtc = date === null ? null : bangkokToUtcIso(date, '12:00');
    if (date === null || noonUtc === null) {
      continue;
    }
    days.push({ date, noonUtc, slots: slots.filter((slot) => bangkokDateOfInstant(slot.startsAtUtc) === date) });
  }
  return days;
}
