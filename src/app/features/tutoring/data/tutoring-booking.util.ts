import { type QueryParamReader, SESSION_FORMATS } from './tutor-search-query.util';
import { bangkokDateOfInstant, daysBetweenDates } from './tutor-slots.util';
import type { IsoUtc, SessionFormat, TutorSlot } from './tutoring-public.models';

/**
 * What `/tutors/:slug/book` was opened with - the choice made on the tutor profile, handed over in the query string. It is a
 * pre-selection only: every value is re-validated against the live tutor data and slots, and the server re-checks and
 * re-prices the booking, so nothing here is trusted for money or availability.
 */
export interface BookingPreselection {
  readonly offeringId?: string;
  readonly startsAtUtc?: IsoUtc;
  readonly durationMinutes?: number;
  readonly format?: SessionFormat;
  readonly trial: boolean;
}

const OFFERING_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const MAX_DURATION_MINUTES = 480;

/** Reads the booking pre-selection from the query string; anything malformed is simply left out. */
export function parseBookingPreselection(params: QueryParamReader): BookingPreselection {
  const offeringId = params.get('offeringId');
  const startsAt = params.get('startsAtUtc');
  const duration = Number(params.get('durationMinutes'));
  const format = SESSION_FORMATS.find((candidate) => candidate === params.get('format'));

  return {
    offeringId: offeringId !== null && OFFERING_ID_PATTERN.test(offeringId) ? offeringId : undefined,
    startsAtUtc: startsAt !== null && !Number.isNaN(Date.parse(startsAt)) ? startsAt : undefined,
    durationMinutes: Number.isInteger(duration) && duration > 0 && duration <= MAX_DURATION_MINUTES ? duration : undefined,
    format,
    trial: params.get('trial') === 'true',
  };
}

/** The length a booking screen starts on when the tutor's allowed list contains it. */
export const PREFERRED_DURATION_MINUTES = 60;

/**
 * The lesson lengths (minutes) a booking screen offers: exactly the profile's `allowedDurationMinutes` - the deployment's own list
 * (`Tutoring:Slots:AllowedDurationsMinutes`, never `null`, never empty on a real server). There is no client-side default list: values that
 * are not positive whole numbers are dropped, duplicates collapse, and the list is shown ascending.
 */
export function allowedDurationsOf(profile: { readonly allowedDurationMinutes: readonly number[] }): readonly number[] {
  return [...new Set(profile.allowedDurationMinutes.filter((minutes) => Number.isInteger(minutes) && minutes > 0))].sort((a, b) => a - b);
}

/** The length to start on: the requested one when allowed, else 60 when allowed, else the shortest allowed; `null` when the server allows none. */
export function initialDurationOf(allowed: readonly number[], requested?: number): number | null {
  if (requested !== undefined && allowed.includes(requested)) {
    return requested;
  }
  return allowed.includes(PREFERRED_DURATION_MINUTES) ? PREFERRED_DURATION_MINUTES : (allowed.at(0) ?? null);
}

/** The slot of `slots` that starts at the instant `startsAtUtc` (compared as instants, so `.000Z` vs `Z` does not matter). */
export function findSlotStartingAt(slots: readonly TutorSlot[], startsAtUtc: IsoUtc | undefined): TutorSlot | undefined {
  if (startsAtUtc === undefined) {
    return undefined;
  }
  const wanted = Date.parse(startsAtUtc);
  return Number.isNaN(wanted) ? undefined : slots.find((slot) => Date.parse(slot.startsAtUtc) === wanted);
}

/**
 * Index of the seven-day calendar window (counted from `todayBangkok`, `YYYY-MM-DD`) that contains `startsAtUtc`; 0 when the
 * time is unknown, in the past or unparseable. Capped at `maxWeekIndex` so a stale link cannot page past the tutor's horizon.
 */
export function initialWeekIndex(todayBangkok: string, startsAtUtc: IsoUtc | undefined, maxWeekIndex: number): number {
  const slotDate = startsAtUtc === undefined ? null : bangkokDateOfInstant(startsAtUtc);
  if (slotDate === null || todayBangkok === '') {
    return 0;
  }
  const weeks = Math.floor(daysBetweenDates(todayBangkok, slotDate) / 7);
  return Math.min(Math.max(weeks, 0), Math.max(maxWeekIndex, 0));
}

// --- Hold countdown ----------------------------------------------------------------------------------------------------

/**
 * `server - browser` clock offset in ms, taken from `serverTimeUtc` at the moment a response arrived. Adding it to the
 * browser's `Date.now()` gives server time, so the hold countdown does not depend on the visitor's device clock being right.
 */
export function serverClockOffsetMs(serverTimeUtc: IsoUtc, browserNowMs: number): number {
  const server = Date.parse(serverTimeUtc);
  return Number.isNaN(server) ? 0 : server - browserNowMs;
}

/** Milliseconds left until `holdExpiresAtUtc` on the server clock (never negative); `null` when there is no hold. */
export function holdRemainingMs(holdExpiresAtUtc: IsoUtc | null, browserNowMs: number, offsetMs: number): number | null {
  if (holdExpiresAtUtc === null) {
    return null;
  }
  const expires = Date.parse(holdExpiresAtUtc);
  return Number.isNaN(expires) ? null : Math.max(0, expires - (browserNowMs + offsetMs));
}

/** `m:ss`, or `h:mm:ss` from an hour up - what a person reads off a countdown. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Coarse stage of a countdown. A screen reader is told when the stage changes (not every second), so the live region does
 * not chatter: plenty of time, five minutes left, one minute left, over.
 */
export type CountdownStage = 'plenty' | 'fiveMinutes' | 'oneMinute' | 'over';

export function countdownStage(remainingMs: number): CountdownStage {
  if (remainingMs <= 0) {
    return 'over';
  }
  if (remainingMs <= 60_000) {
    return 'oneMinute';
  }
  return remainingMs <= 300_000 ? 'fiveMinutes' : 'plenty';
}
