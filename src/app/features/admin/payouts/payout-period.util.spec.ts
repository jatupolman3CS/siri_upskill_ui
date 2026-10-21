import { PAYOUT_ROUND_TYPES, currentMonthKey, defaultPeriodKey, isoWeekKeyAt, periodKeyIssue, recentIsoWeekKeys } from './payout-period.util';

// Instants are written in UTC; Thai local time is UTC+7, so a week turns over on Sunday 17:00 UTC.
const at = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number => Date.UTC(year, month - 1, day, hour, minute, second);

describe('payout round kinds', () => {
  it('are exactly the sourceType names the payout endpoint accepts', () => {
    expect(PAYOUT_ROUND_TYPES).toEqual(['Course', 'Tutoring']);
  });
});

describe('isoWeekKeyAt (ISO-8601 week in Thai local time)', () => {
  it('names an ordinary week', () => {
    // 2026-10-12 is a Monday and 2026-01-01 a Thursday, so 12 October is the Monday of week 42.
    expect(isoWeekKeyAt(at(2026, 10, 15))).toBe('2026-W42');
    expect(isoWeekKeyAt(at(2026, 10, 12, 1))).toBe('2026-W42');
  });

  it('turns the week over on Monday 00:00 Thai time, which is Sunday 17:00 UTC', () => {
    expect(isoWeekKeyAt(at(2026, 10, 11, 16, 59, 59))).toBe('2026-W41');
    expect(isoWeekKeyAt(at(2026, 10, 11, 17))).toBe('2026-W42');
  });

  it('belongs a week to its ISO week-year, not the calendar year', () => {
    expect(isoWeekKeyAt(at(2024, 12, 30))).toBe('2025-W01');
    expect(isoWeekKeyAt(at(2027, 1, 1))).toBe('2026-W53');
    expect(isoWeekKeyAt(at(2021, 1, 3))).toBe('2020-W53');
    expect(isoWeekKeyAt(at(2025, 12, 29))).toBe('2026-W01');
  });
});

describe('recentIsoWeekKeys', () => {
  it('lists the current week first, then the ones before it, across a year boundary', () => {
    expect(recentIsoWeekKeys(at(2027, 1, 5), 3)).toEqual(['2027-W01', '2026-W53', '2026-W52']);
  });
});

describe('defaultPeriodKey', () => {
  it('starts a course round on the current month', () => {
    expect(defaultPeriodKey('Course', new Date(2026, 7, 15, 12).getTime())).toBe('2026-08');
    expect(currentMonthKey(new Date(2026, 0, 31, 12))).toBe('2026-01');
  });

  it('starts a tutoring round on the week that just ended', () => {
    // 2026-08-15 is in week 33; week 32 is the last one that is over.
    expect(defaultPeriodKey('Tutoring', at(2026, 8, 15))).toBe('2026-W32');
    expect(defaultPeriodKey('Tutoring', at(2027, 1, 5))).toBe('2026-W53');
  });
});

describe('periodKeyIssue', () => {
  it('accepts a month key for a course round and nothing else', () => {
    expect(periodKeyIssue('Course', '2026-08')).toBeNull();
    expect(periodKeyIssue('Course', ' 2026-12 ')).toBeNull();
    for (const bad of ['2026-00', '2026-13', '2026-8', '26-08', '2026-08-01', '2026-W41']) {
      expect(periodKeyIssue('Course', bad), bad).toBe('invalid');
    }
  });

  it('accepts an ISO week key for a tutoring round, only for a week that exists', () => {
    expect(periodKeyIssue('Tutoring', '2026-W41')).toBeNull();
    expect(periodKeyIssue('Tutoring', ' 2026-W41 ')).toBeNull();
    // 2026 and 2020 have 53 ISO weeks; 2025 and 2024 have 52.
    expect(periodKeyIssue('Tutoring', '2026-W53')).toBeNull();
    expect(periodKeyIssue('Tutoring', '2020-W53')).toBeNull();
    for (const bad of ['2025-W53', '2024-W53', '2026-W54', '2026-W00', '2026-w41', '2026-W4', '2026-41', '2026-08', '1969-W10', '3000-W01']) {
      expect(periodKeyIssue('Tutoring', bad), bad).toBe('invalid');
    }
  });

  it('asks for a key when there is none, whichever the kind', () => {
    expect(periodKeyIssue('Course', '')).toBe('required');
    expect(periodKeyIssue('Tutoring', '   ')).toBe('required');
  });
});
