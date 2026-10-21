import { addDaysToDate } from '../../live/data/live-instructor.util';
import type {
  AvailabilityRule,
  CreateExceptionRequest,
  ExceptionViolation,
  RuleViolation,
  SettingsRequest,
} from '../data/tutoring-availability.models';
import { type FieldIssues, integerIssue, issue, optionalTextIssue, trimToNull } from '../ui/tutor-form.util';

/**
 * Pure logic of the availability screen (P13-25): the weekly-window draft, the settings and exception forms, and the
 * mapping of the server's `violation` codes to fields / messages. Everything here is a CONVENIENCE - it tells a person about a
 * mistake before the round trip. The server (`AvailabilityRuleSetValidator`, `AvailabilityExceptionValidator`) re-checks every
 * rule and its answer always wins; what is open for booking is decided by the server's slot calculator, never here.
 */

/**
 * The step of the time pickers. Mirrors the default of the server option `Tutoring:Slots:GridMinutes` (P13-03 section 7); no
 * endpoint exposes it, so it is duplicated here on purpose. A time the server's grid refuses comes back as `violation: grid`.
 */
export const GRID_MINUTES = 30;
export const MIN_NOTICE_RANGE = { min: 1, max: 168 } as const;
export const MAX_ADVANCE_RANGE = { min: 7, max: 180 } as const;
export const EXCEPTION_NOTE_MAX = 200;
/** An exception may be dated at most this many days ahead (P13-03 section 5.4). */
export const EXCEPTION_MAX_DAYS_AHEAD = 365;
/** The week as the tutor reads it (Monday first); the numbers are the server's `dayOfWeek` (0 = Sunday). */
export const WEEK_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function minuteOfDay(time: string): number {
  const match = TIME_PATTERN.exec(time);
  return match === null ? Number.NaN : Number(match[1]) * 60 + Number(match[2]);
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/**
 * Every grid time of a day (`00:00`, `00:30` ... `23:30`) plus any `extra` value already on screen (a stored time that is off
 * the grid must stay selectable, or the select would silently show another time and the next save would rewrite it).
 */
export function timeChoices(extra: readonly string[] = []): readonly string[] {
  const choices = new Set<string>();
  for (let minute = 0; minute < MINUTES_PER_DAY; minute += GRID_MINUTES) {
    choices.add(formatMinute(minute));
  }
  for (const value of extra) {
    if (TIME_PATTERN.test(value)) {
      choices.add(value);
    }
  }
  return [...choices].sort();
}

/** Minutes a window lasts; an end that is not after its start runs into the next day (`22:00-02:00` = 240). */
export function windowMinutes(start: string, end: string): number {
  const length = minuteOfDay(end) - minuteOfDay(start);
  return length > 0 ? length : length + MINUTES_PER_DAY;
}

/** True when the window ends the next day (`end` is not after `start`, and the two differ). */
export function crossesMidnight(start: string, end: string): boolean {
  return start !== end && minuteOfDay(end) <= minuteOfDay(start);
}

// --- Weekly draft -------------------------------------------------------------------------------------------------------------

export interface DraftWindow {
  /** Stable identity for `@for` / error attachment; never sent to the server. */
  readonly key: string;
  readonly start: string;
  readonly end: string;
}

/** The windows of each day, keyed by the server's day number. */
export type DraftWeek = Readonly<Record<number, readonly DraftWindow[]>>;

export interface FlatRule {
  readonly key: string;
  readonly rule: AvailabilityRule;
}

export function emptyWeek(): DraftWeek {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function draftFromRules(rules: readonly AvailabilityRule[], makeKey: () => string): DraftWeek {
  const week: Record<number, DraftWindow[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const rule of rules) {
    (week[rule.dayOfWeek] ??= []).push({ key: makeKey(), start: rule.startLocal, end: rule.endLocal });
  }
  for (const day of Object.keys(week)) {
    week[Number(day)].sort((a, b) => a.start.localeCompare(b.start));
  }
  return week;
}

/**
 * The draft as the list the server receives: Monday first, windows by start time. The ORDER IS THE CONTRACT with the server's
 * `index` (it names a rule by its position in the request), so the same list is used to send and to map an error back.
 */
export function flattenDraft(week: DraftWeek): readonly FlatRule[] {
  return WEEK_DAYS.flatMap((day) =>
    [...(week[day] ?? [])]
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
      .map((window) => ({ key: window.key, rule: { dayOfWeek: day, startLocal: window.start, endLocal: window.end } })),
  );
}

const canonical = (rule: AvailabilityRule): string => `${rule.dayOfWeek}|${rule.startLocal}|${rule.endLocal}`;

/** Same set of windows, regardless of order - the "is there anything to save" test. */
export function sameRules(a: readonly AvailabilityRule[], b: readonly AvailabilityRule[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = a.map(canonical).sort();
  const right = b.map(canonical).sort();
  return left.every((value, index) => value === right[index]);
}

export type DraftIssue = 'order' | 'overlap';

interface Piece {
  readonly start: number;
  readonly end: number;
  readonly key: string;
}

/** The week is a circle of 10 080 minutes: a window running past Saturday midnight continues from Sunday 00:00. */
function piecesOf(flat: FlatRule): readonly Piece[] {
  const start = flat.rule.dayOfWeek * MINUTES_PER_DAY + minuteOfDay(flat.rule.startLocal);
  const end = start + windowMinutes(flat.rule.startLocal, flat.rule.endLocal);
  return end > MINUTES_PER_WEEK
    ? [
        { start, end: MINUTES_PER_WEEK, key: flat.key },
        { start: 0, end: end - MINUTES_PER_WEEK, key: flat.key },
      ]
    : [{ start, end, key: flat.key }];
}

/**
 * Mistakes the page can spot without the server: a window whose start equals its end, and windows that overlap (across
 * midnight and across the Saturday-to-Sunday wrap too; windows that only touch are fine). Both windows of an overlapping pair
 * are marked so the person sees both.
 */
export function findDraftIssues(flat: readonly FlatRule[]): ReadonlyMap<string, DraftIssue> {
  const found = new Map<string, DraftIssue>();
  const pieces: Piece[] = [];
  for (const entry of flat) {
    if (entry.rule.startLocal === entry.rule.endLocal) {
      found.set(entry.key, 'order');
    } else if (!Number.isNaN(minuteOfDay(entry.rule.startLocal)) && !Number.isNaN(minuteOfDay(entry.rule.endLocal))) {
      pieces.push(...piecesOf(entry));
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (pieces[i].key !== pieces[j].key && pieces[i].start < pieces[j].end && pieces[j].start < pieces[i].end) {
        found.set(pieces[i].key, found.get(pieces[i].key) ?? 'overlap');
        found.set(pieces[j].key, found.get(pieces[j].key) ?? 'overlap');
      }
    }
  }
  return found;
}

const RULE_VIOLATIONS: readonly RuleViolation[] = ['format', 'order', 'grid', 'too_long', 'overlap', 'too_many'];

/** i18n key explaining a violation the server named for a weekly rule; a code this client does not know degrades to a generic line. */
export function ruleViolationKey(violation: string | undefined): string {
  return (RULE_VIOLATIONS as readonly string[]).includes(violation ?? '')
    ? `tutoring.tutor.availability.rules.violation.${violation}`
    : 'tutoring.tutor.availability.rules.violation.unknown';
}

// --- Settings -----------------------------------------------------------------------------------------------------------------

export type SettingsField = 'minNoticeHours' | 'bufferMinutes' | 'maxAdvanceDays';

export interface SettingsFormValue {
  readonly minNoticeHours: string;
  readonly bufferMinutes: string;
  readonly maxAdvanceDays: string;
}

/** Property names a `400` validation answer uses (the C# record's names), mapped to this form's fields. */
export const SETTINGS_PROPERTY_TO_FIELD: Readonly<Record<string, SettingsField>> = {
  MinNoticeHours: 'minNoticeHours',
  BufferMinutes: 'bufferMinutes',
  MaxAdvanceDays: 'maxAdvanceDays',
};

/**
 * `allowedBuffers` is the server's own list (`allowedBufferMinutes` of `GET tutor/availability`) - passed in, never defaulted, so the
 * client cannot offer or accept a rest length the deployment does not.
 */
export function validateSettings(value: SettingsFormValue, allowedBuffers: readonly number[]): FieldIssues<SettingsField> {
  const issues: FieldIssues<SettingsField> = {};
  const notice = integerIssue(value.minNoticeHours, MIN_NOTICE_RANGE.min, MIN_NOTICE_RANGE.max);
  if (notice) {
    issues.minNoticeHours = notice;
  }
  const advance = integerIssue(value.maxAdvanceDays, MAX_ADVANCE_RANGE.min, MAX_ADVANCE_RANGE.max);
  if (advance) {
    issues.maxAdvanceDays = advance;
  }
  if (!allowedBuffers.includes(Number(value.bufferMinutes))) {
    issues.bufferMinutes = issue('tutoring.tutor.validation.notAllowed');
  }
  return issues;
}

export function settingsRequest(value: SettingsFormValue, rowVersion: string): SettingsRequest {
  return {
    minNoticeHours: Number(value.minNoticeHours),
    bufferMinutes: Number(value.bufferMinutes),
    maxAdvanceDays: Number(value.maxAdvanceDays),
    rowVersion,
  };
}

// --- Exceptions ---------------------------------------------------------------------------------------------------------------

/** What the tutor is adding; the API has two kinds (`Closed`, `ExtraOpen`) and `Closed` with or without times. */
export type ExceptionChoice = 'closedAllDay' | 'closedRange' | 'extraOpen';
export const EXCEPTION_CHOICES: readonly ExceptionChoice[] = ['closedAllDay', 'closedRange', 'extraOpen'];

export type ExceptionField = 'date' | 'choice' | 'start' | 'end' | 'note';

export interface ExceptionFormValue {
  readonly date: string;
  readonly choice: ExceptionChoice;
  readonly start: string;
  readonly end: string;
  readonly note: string;
}

export function needsTimes(choice: ExceptionChoice): boolean {
  return choice !== 'closedAllDay';
}

export function validateException(value: ExceptionFormValue, todayLocal: string): FieldIssues<ExceptionField> {
  const issues: FieldIssues<ExceptionField> = {};
  if (value.date === '') {
    issues.date = issue('tutoring.tutor.validation.required');
  } else if (todayLocal !== '' && value.date < todayLocal) {
    issues.date = issue('tutoring.tutor.availability.exceptions.validation.pastDate');
  } else if (todayLocal !== '') {
    const limit = addDaysToDate(todayLocal, EXCEPTION_MAX_DAYS_AHEAD);
    if (limit !== null && value.date > limit) {
      issues.date = issue('tutoring.tutor.availability.exceptions.validation.tooFar', { days: EXCEPTION_MAX_DAYS_AHEAD });
    }
  }
  if (needsTimes(value.choice)) {
    if (value.start === '') {
      issues.start = issue('tutoring.tutor.validation.required');
    }
    if (value.end === '') {
      issues.end = issue('tutoring.tutor.validation.required');
    } else if (value.start !== '' && value.end <= value.start) {
      // An exception may not cross midnight (P13-03): a day-spanning closure is one exception per day.
      issues.end = issue('tutoring.tutor.availability.exceptions.validation.endAfterStart');
    }
  }
  const note = optionalTextIssue(value.note, EXCEPTION_NOTE_MAX);
  if (note) {
    issues.note = note;
  }
  return issues;
}

export function exceptionRequest(value: ExceptionFormValue): CreateExceptionRequest {
  return {
    dateLocal: value.date,
    kind: value.choice === 'extraOpen' ? 'ExtraOpen' : 'Closed',
    startLocal: needsTimes(value.choice) ? value.start : null,
    endLocal: needsTimes(value.choice) ? value.end : null,
    note: trimToNull(value.note),
  };
}

const EXCEPTION_VIOLATION_FIELDS: Readonly<Record<ExceptionViolation, ExceptionField>> = {
  date: 'date',
  date_window: 'date',
  kind: 'choice',
  time: 'start',
  order: 'end',
  grid: 'start',
  note: 'note',
};

/** The form field a server `violation` of the exception endpoint points at, or `null` for a code this client does not know. */
export function exceptionViolationField(violation: string | undefined): ExceptionField | null {
  return violation !== undefined && Object.hasOwn(EXCEPTION_VIOLATION_FIELDS, violation) ? EXCEPTION_VIOLATION_FIELDS[violation as ExceptionViolation] : null;
}

/** Whole-number text of a stored setting, as a form control wants it. */
export function settingText(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}


/** Which of the three things a stored exception is. */
export function exceptionChoiceOf(item: { readonly kind: string; readonly startLocal: string | null; readonly endLocal: string | null }): ExceptionChoice {
  if (item.kind === 'ExtraOpen') {
    return 'extraOpen';
  }
  return item.startLocal === null && item.endLocal === null ? 'closedAllDay' : 'closedRange';
}

/**
 * A calendar date (`yyyy-MM-dd`, Bangkok) as an instant at noon Bangkok time, so `bangkokDate` can format it in the person's
 * language without the day ever shifting (noon is far from any date boundary).
 */
export function localDateToInstant(dateLocal: string): string {
  return `${dateLocal}T12:00:00+07:00`;
}
