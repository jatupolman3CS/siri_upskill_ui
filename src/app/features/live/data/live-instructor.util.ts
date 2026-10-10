import type {
  GoogleCallbackReason,
  GoogleCallbackResult,
  InstructorMeetingSummary,
} from './live-instructor.models';
import { liveErrorKey } from './live-errors';
import { problemOf, type IsoUtc } from './live.models';

/**
 * Thailand has been UTC+7 all year (no daylight saving) since 1920, so a fixed offset is exact for every instant this
 * app will ever see. Angular's `DatePipe` does NOT understand IANA zone names (only `UTC` / `+0700`), which is why the
 * display side also uses the numeric offset — see `BangkokDatePipe`.
 */
export const BANGKOK_OFFSET_MINUTES = 7 * 60;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MINUTE_MS = 60_000;

export interface BangkokParts {
  /** `YYYY-MM-DD` — value of an `<input type="date">`. */
  readonly date: string;
  /** `HH:mm` — value of an `<input type="time">`. */
  readonly time: string;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Converts what the instructor typed (a calendar date + wall-clock time in Asia/Bangkok) to a UTC ISO instant with a
 * trailing `Z` — the only shape the API accepts (never an offset such as `+07:00`). Returns `null` for anything that is
 * not a real date/time (e.g. `2026-02-31`).
 */
export function bangkokToUtcIso(date: string, time: string): IsoUtc | null {
  const dateMatch = DATE_PATTERN.exec(date);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) {
    return null;
  }
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (hour > 23 || minute > 59) {
    return null;
  }
  const bangkokAsUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(bangkokAsUtcMs);
  // Date.UTC silently rolls over impossible dates (Feb 31 -> Mar 3); reject those instead of saving a surprise.
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  const utc = new Date(bangkokAsUtcMs - BANGKOK_OFFSET_MINUTES * MINUTE_MS);
  return `${pad(utc.getUTCFullYear(), 4)}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:00Z`;
}

/** Inverse of {@link bangkokToUtcIso}: splits a UTC instant into Bangkok wall-clock date/time for the form inputs. */
export function utcToBangkokParts(iso: IsoUtc): BangkokParts | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  const shifted = new Date(ms + BANGKOK_OFFSET_MINUTES * MINUTE_MS);
  return {
    date: `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

/** `2026-10-08` + 1 -> `2026-10-09` (calendar arithmetic on the date part only; no time zone involved). */
export function addDaysToDate(date: string, days: number): string | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    return null;
  }
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Minutes between two UTC instants (end - start), or `null` when either is unparseable. */
export function minutesBetween(startIso: IsoUtc, endIso: IsoUtc): number | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  return Number.isNaN(start) || Number.isNaN(end) ? null : Math.round((end - start) / MINUTE_MS);
}

/** Session length the API accepts: 15 minutes to 8 hours (appendix §C.2). The server remains the authority. */
export const MIN_SESSION_MINUTES = 15;
export const MAX_SESSION_MINUTES = 8 * 60;

/** Client-side sanity check for a pasted room link — https only. The server's allow-list is the real decision. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

// --- Google callback query (appendix §A.3) ---------------------------------------------------------------------------

const CALLBACK_REASONS: readonly GoogleCallbackReason[] = [
  'access_denied',
  'state_invalid',
  'scope_missing',
  'no_refresh_token',
  'exchange_failed',
  'recording_scope_missing',
];

/** Minimal slice of Angular's `ParamMap` — keeps this function trivially unit-testable. */
export interface QueryParamReader {
  get(name: string): string | null;
}

/**
 * Reads the `?google=connected|error&reason=…` the API's OAuth callback redirect appends. `null` = the page was opened
 * normally (no callback in flight). An unrecognised `google` value is ignored so a hand-edited URL does nothing.
 */
export function parseGoogleCallback(params: QueryParamReader): GoogleCallbackResult | null {
  const outcome = params.get('google');
  if (outcome === 'connected') {
    return { outcome: 'connected' };
  }
  if (outcome === 'error') {
    const reason = params.get('reason');
    const known = CALLBACK_REASONS.find((candidate) => candidate === reason) ?? null;
    return { outcome: 'error', reason: known };
  }
  return null;
}

// --- Meeting state -> UI (needsAction is the discriminator; the server derives it, the UI never does) -----------------

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusView {
  readonly labelKey: string;
  /** Phosphor icon name — registered by the consuming component's `provideIcons`. */
  readonly icon: string;
  readonly tone: StatusTone;
}

/** Room status label + icon + tone. Text AND icon always, never colour alone (ui-design.md a11y). */
export function meetingStatusView(meeting: InstructorMeetingSummary): StatusView {
  switch (meeting.needsAction) {
    case 'Waiting':
      return { labelKey: 'live.instructor.meeting.waiting', icon: 'phosphorHourglass', tone: 'info' };
    case 'PasteLink':
      return { labelKey: 'live.instructor.meeting.pasteLink', icon: 'phosphorLinkSimple', tone: 'warning' };
    case 'ReconnectGoogle':
      return { labelKey: 'live.instructor.meeting.reconnectGoogle', icon: 'phosphorPlugs', tone: 'warning' };
    case 'Retry':
      return { labelKey: 'live.instructor.meeting.retry', icon: 'phosphorWarningCircle', tone: 'danger' };
    case 'None':
    default:
      if (meeting.syncStatus === 'Deleted' || meeting.syncStatus === 'PendingDelete') {
        return { labelKey: 'live.instructor.meeting.removed', icon: 'phosphorProhibit', tone: 'neutral' };
      }
      return meeting.isUsable
        ? { labelKey: 'live.instructor.meeting.ready', icon: 'phosphorCheckCircle', tone: 'success' }
        : { labelKey: 'live.instructor.meeting.unavailable', icon: 'phosphorCircleDashed', tone: 'neutral' };
  }
}

const KNOWN_MEETING_ERROR_CODES: readonly string[] = [
  'conference_pending',
  'google_account_unavailable',
  'invalid_grant',
];

/** i18n key for a meeting `errorCode`, or `null` when there is no error. Raw codes are never displayed. */
export function meetingErrorKey(code: string | null): string | null {
  if (!code) {
    return null;
  }
  return KNOWN_MEETING_ERROR_CODES.includes(code)
    ? `live.instructor.meetingError.${code}`
    : 'live.instructor.meetingError.unknown';
}

/** True while at least one room is still being created — the only condition under which the builder polls. */
export function hasWaitingMeeting(items: readonly InstructorMeetingSummary[]): boolean {
  return items.some((item) => item.needsAction === 'Waiting');
}

// --- API problem -> i18n key ----------------------------------------------------------------------------------------

/** Hosts the server accepts for a pasted room link (appendix §0). Not translatable text, so it lives here. */
export const ALLOWED_MEETING_HOSTS = 'meet.google.com, zoom.us, teams.microsoft.com';

export interface ProblemMessage {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

const GENERIC_ERROR_KEY = 'live.errors.generic';
const NOT_FOUND_ERROR_KEY = 'live.errors.notFoundOrNoAccess';

/**
 * Resolves a failed instructor-side call to a translatable message through the shared `liveErrorKey` map (so a failure reads
 * the same on every Live screen). Two instructor-specific touches: the params some of those messages interpolate
 * (`hosts`, `count`) are always supplied, and a plain 404 from a Catalog route (which carries no Live `reason`) reads as
 * "not found" instead of the generic message.
 */
export function instructorProblemMessage(error: unknown): ProblemMessage {
  const problem = problemOf(error);
  const key = liveErrorKey(error);
  const params = { hosts: ALLOWED_MEETING_HOSTS, count: problem?.sessionIds?.length ?? 0 };
  if (key === GENERIC_ERROR_KEY && problem?.status === 404) {
    return { key: NOT_FOUND_ERROR_KEY, params };
  }
  return { key, params };
}

/**
 * Message for a failed session create / update. Unlike the room endpoints, the Catalog write routes answer a bad time range
 * (past / too short / too long) with a plain 400 and an overlap with a plain 409 — no Live `reason` — so those two get their
 * own friendlier text; anything carrying a known reason still goes through the shared map.
 */
export function sessionWriteProblemMessage(error: unknown): ProblemMessage {
  const problem = problemOf(error);
  const shared = instructorProblemMessage(error);
  if (problem && !problem.reason && shared.key === GENERIC_ERROR_KEY) {
    if (problem.status === 400) {
      return { key: 'live.builder.form.errorTime' };
    }
    if (problem.status === 409) {
      return { key: 'live.builder.form.errorConflict' };
    }
  }
  return shared;
}
