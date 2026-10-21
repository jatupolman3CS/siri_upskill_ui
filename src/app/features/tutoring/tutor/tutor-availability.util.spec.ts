import type { AvailabilityRule } from '../data/tutoring-availability.models';
import {
  type DraftWeek,
  type ExceptionFormValue,
  type SettingsFormValue,
  WEEK_DAYS,
  crossesMidnight,
  draftFromRules,
  emptyWeek,
  exceptionChoiceOf,
  exceptionRequest,
  exceptionViolationField,
  findDraftIssues,
  flattenDraft,
  localDateToInstant,
  minuteOfDay,
  ruleViolationKey,
  sameRules,
  settingsRequest,
  timeChoices,
  validateException,
  validateSettings,
  windowMinutes,
} from './tutor-availability.util';

const rule = (dayOfWeek: number, startLocal: string, endLocal: string): AvailabilityRule => ({ dayOfWeek, startLocal, endLocal });

function weekOf(rules: readonly AvailabilityRule[]): DraftWeek {
  let counter = 0;
  return draftFromRules(rules, () => `k${counter++}`);
}

describe('time helpers', () => {
  it('offers every half hour of a day and keeps an off-grid stored time selectable', () => {
    const choices = timeChoices();
    expect(choices).toHaveLength(48);
    expect(choices[0]).toBe('00:00');
    expect(choices.at(-1)).toBe('23:30');
    expect(timeChoices(['09:15', 'not a time'])).toContain('09:15');
    expect(timeChoices(['09:15', 'not a time'])).not.toContain('not a time');
    expect(timeChoices(['09:15'])).toHaveLength(49);
  });

  it('measures a window, running into the next day when the end is not after the start', () => {
    expect(windowMinutes('09:00', '12:00')).toBe(180);
    expect(windowMinutes('22:00', '02:00')).toBe(240);
    expect(windowMinutes('22:00', '00:00')).toBe(120);
    expect(crossesMidnight('22:00', '02:00')).toBe(true);
    expect(crossesMidnight('22:00', '00:00')).toBe(true);
    expect(crossesMidnight('09:00', '12:00')).toBe(false);
    expect(crossesMidnight('09:00', '09:00')).toBe(false);
    expect(minuteOfDay('09:30')).toBe(570);
    expect(minuteOfDay('9:30')).toBeNaN();
  });
});

describe('weekly draft', () => {
  it('builds a Monday-first flat list, windows by start time - the order the server indexes its errors by', () => {
    const flat = flattenDraft(weekOf([rule(0, '10:00', '12:00'), rule(1, '13:00', '17:00'), rule(1, '09:00', '12:00'), rule(6, '09:00', '10:00')]));
    expect(flat.map((entry) => entry.rule)).toEqual([rule(1, '09:00', '12:00'), rule(1, '13:00', '17:00'), rule(6, '09:00', '10:00'), rule(0, '10:00', '12:00')]);
    expect(WEEK_DAYS).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(flattenDraft(emptyWeek())).toEqual([]);
  });

  it('tells a changed set from the same set in another order', () => {
    const a = [rule(1, '09:00', '12:00'), rule(2, '09:00', '12:00')];
    expect(sameRules(a, [a[1], a[0]])).toBe(true);
    expect(sameRules(a, [a[0]])).toBe(false);
    expect(sameRules(a, [a[0], rule(2, '09:00', '13:00')])).toBe(false);
  });

  it('flags a window whose start equals its end', () => {
    const flat = flattenDraft(weekOf([rule(1, '09:00', '09:00')]));
    expect([...findDraftIssues(flat).values()]).toEqual(['order']);
  });

  it('flags overlapping windows - both of them - and lets windows that only touch stand', () => {
    expect(findDraftIssues(flattenDraft(weekOf([rule(1, '09:00', '12:00'), rule(1, '11:00', '14:00')]))).size).toBe(2);
    expect(findDraftIssues(flattenDraft(weekOf([rule(1, '09:00', '12:00'), rule(1, '12:00', '15:00')]))).size).toBe(0);
  });

  it('catches an overlap across midnight and across the Saturday-to-Sunday wrap', () => {
    // Friday 22:00 -> Saturday 02:00 against Saturday 01:00-03:00.
    expect(findDraftIssues(flattenDraft(weekOf([rule(5, '22:00', '02:00'), rule(6, '01:00', '03:00')]))).size).toBe(2);
    // Saturday 22:00 -> Sunday 02:00 against Sunday 01:00-03:00 (the week is a circle).
    expect(findDraftIssues(flattenDraft(weekOf([rule(6, '22:00', '02:00'), rule(0, '01:00', '03:00')]))).size).toBe(2);
    // ...and touching at 02:00 is fine.
    expect(findDraftIssues(flattenDraft(weekOf([rule(6, '22:00', '02:00'), rule(0, '02:00', '05:00')]))).size).toBe(0);
  });

  it('maps a server violation to a message and degrades an unknown one', () => {
    expect(ruleViolationKey('overlap')).toBe('tutoring.tutor.availability.rules.violation.overlap');
    expect(ruleViolationKey('too_long')).toBe('tutoring.tutor.availability.rules.violation.too_long');
    expect(ruleViolationKey('from_the_future')).toBe('tutoring.tutor.availability.rules.violation.unknown');
    expect(ruleViolationKey(undefined)).toBe('tutoring.tutor.availability.rules.violation.unknown');
  });
});

describe('settings form', () => {
  // The allowed rest lengths are the server's list (`allowedBufferMinutes`), passed in - deliberately NOT the platform defaults, so a
  // validator that fell back to a built-in list would fail these cases.
  const ALLOWED = [0, 10, 25];
  const ok: SettingsFormValue = { minNoticeHours: '24', bufferMinutes: '10', maxAdvanceDays: '60' };

  it('accepts a value inside every server bound', () => {
    expect(validateSettings(ok, ALLOWED)).toEqual({});
    expect(validateSettings({ minNoticeHours: '1', bufferMinutes: '0', maxAdvanceDays: '180' }, ALLOWED)).toEqual({});
  });

  it('points at each field that is out of range or not allowed', () => {
    const issues = validateSettings({ minNoticeHours: '0', bufferMinutes: '7', maxAdvanceDays: '6' }, ALLOWED);
    expect(Object.keys(issues).sort()).toEqual(['bufferMinutes', 'maxAdvanceDays', 'minNoticeHours']);
    expect(validateSettings({ ...ok, minNoticeHours: '169' }, ALLOWED).minNoticeHours?.key).toBe('tutoring.tutor.validation.outOfRange');
    expect(validateSettings({ ...ok, minNoticeHours: '' }, ALLOWED).minNoticeHours?.key).toBe('tutoring.tutor.validation.required');
    expect(validateSettings({ ...ok, maxAdvanceDays: '10.5' }, ALLOWED).maxAdvanceDays?.key).toBe('tutoring.tutor.validation.wholeNumber');
  });

  it('allows only the rest lengths the server lists - 5 is a platform default but not in this list', () => {
    expect(validateSettings({ ...ok, bufferMinutes: '25' }, ALLOWED)).toEqual({});
    expect(validateSettings({ ...ok, bufferMinutes: '5' }, ALLOWED).bufferMinutes?.key).toBe('tutoring.tutor.validation.notAllowed');
    expect(validateSettings({ ...ok, bufferMinutes: '10' }, [5, 15]).bufferMinutes?.key).toBe('tutoring.tutor.validation.notAllowed');
  });

  it('builds numbers for the request and carries the row version unchanged', () => {
    expect(settingsRequest(ok, 'AAAAAAAAB9E=')).toEqual({ minNoticeHours: 24, bufferMinutes: 10, maxAdvanceDays: 60, rowVersion: 'AAAAAAAAB9E=' });
  });
});

describe('exception form', () => {
  const TODAY = '2026-10-15';
  const closedAllDay: ExceptionFormValue = { date: '2026-10-20', choice: 'closedAllDay', start: '', end: '', note: '' };

  it('accepts a whole-day closure with no times', () => {
    expect(validateException(closedAllDay, TODAY)).toEqual({});
  });

  it('refuses a past date, a date more than a year ahead and a missing date', () => {
    expect(validateException({ ...closedAllDay, date: '2026-10-14' }, TODAY).date?.key).toBe('tutoring.tutor.availability.exceptions.validation.pastDate');
    expect(validateException({ ...closedAllDay, date: '2027-10-16' }, TODAY).date?.key).toBe('tutoring.tutor.availability.exceptions.validation.tooFar');
    expect(validateException({ ...closedAllDay, date: '2027-10-15' }, TODAY)).toEqual({});
    expect(validateException({ ...closedAllDay, date: '' }, TODAY).date?.key).toBe('tutoring.tutor.validation.required');
  });

  it('needs both times for a part-day closure or extra hours, ending after the start on the same day', () => {
    const range: ExceptionFormValue = { ...closedAllDay, choice: 'closedRange', start: '10:00', end: '11:00' };
    expect(validateException(range, TODAY)).toEqual({});
    expect(validateException({ ...range, start: '' }, TODAY).start?.key).toBe('tutoring.tutor.validation.required');
    expect(validateException({ ...range, end: '' }, TODAY).end?.key).toBe('tutoring.tutor.validation.required');
    expect(validateException({ ...range, end: '10:00' }, TODAY).end?.key).toBe('tutoring.tutor.availability.exceptions.validation.endAfterStart');
    // An end at midnight reads "00:00", which is not after any start - the latest end is 23:30.
    expect(validateException({ ...range, choice: 'extraOpen', end: '00:00' }, TODAY).end?.key).toBe('tutoring.tutor.availability.exceptions.validation.endAfterStart');
    expect(validateException({ ...range, choice: 'extraOpen', start: '20:00', end: '23:30' }, TODAY)).toEqual({});
  });

  it('refuses a note with markup or over 200 characters', () => {
    expect(validateException({ ...closedAllDay, note: '<b>x</b>' }, TODAY).note?.key).toBe('tutoring.tutor.validation.noMarkup');
    expect(validateException({ ...closedAllDay, note: 'x'.repeat(201) }, TODAY).note?.key).toBe('tutoring.tutor.validation.tooLong');
  });

  it('builds the request: Closed with null times for a whole day, the kind and times otherwise, an empty note as null', () => {
    expect(exceptionRequest(closedAllDay)).toEqual({ dateLocal: '2026-10-20', kind: 'Closed', startLocal: null, endLocal: null, note: null });
    expect(exceptionRequest({ ...closedAllDay, choice: 'closedRange', start: '10:00', end: '11:00', note: ' Dentist ' })).toEqual({
      dateLocal: '2026-10-20',
      kind: 'Closed',
      startLocal: '10:00',
      endLocal: '11:00',
      note: 'Dentist',
    });
    expect(exceptionRequest({ ...closedAllDay, choice: 'extraOpen', start: '08:00', end: '10:00' }).kind).toBe('ExtraOpen');
  });

  it('maps each server violation to a form field and ignores an unknown one', () => {
    expect(exceptionViolationField('date')).toBe('date');
    expect(exceptionViolationField('date_window')).toBe('date');
    expect(exceptionViolationField('kind')).toBe('choice');
    expect(exceptionViolationField('time')).toBe('start');
    expect(exceptionViolationField('order')).toBe('end');
    expect(exceptionViolationField('grid')).toBe('start');
    expect(exceptionViolationField('note')).toBe('note');
    expect(exceptionViolationField('toString')).toBeNull();
    expect(exceptionViolationField(undefined)).toBeNull();
  });

  it('classifies a stored exception and renders its date at noon Bangkok so the day never shifts', () => {
    expect(exceptionChoiceOf({ kind: 'Closed', startLocal: null, endLocal: null })).toBe('closedAllDay');
    expect(exceptionChoiceOf({ kind: 'Closed', startLocal: '10:00', endLocal: '11:00' })).toBe('closedRange');
    expect(exceptionChoiceOf({ kind: 'ExtraOpen', startLocal: '10:00', endLocal: '11:00' })).toBe('extraOpen');
    expect(localDateToInstant('2026-10-20')).toBe('2026-10-20T12:00:00+07:00');
  });
});
