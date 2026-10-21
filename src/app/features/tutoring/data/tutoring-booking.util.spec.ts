import type { TutorSlot } from './tutoring-public.models';
import {
  allowedDurationsOf,
  countdownStage,
  findSlotStartingAt,
  formatCountdown,
  holdRemainingMs,
  initialDurationOf,
  initialWeekIndex,
  parseBookingPreselection,
  serverClockOffsetMs,
} from './tutoring-booking.util';

const reader = (query: Record<string, string>) => ({ get: (name: string): string | null => query[name] ?? null });

const slot = (startsAtUtc: string): TutorSlot => ({ startsAtUtc, endsAtUtc: startsAtUtc, seatsLeft: 1, joinsExistingGroup: false });

describe('parseBookingPreselection', () => {
  it('reads every field the tutor profile hands over', () => {
    expect(
      parseBookingPreselection(
        reader({ offeringId: 'off-1', startsAtUtc: '2026-10-20T11:00:00Z', durationMinutes: '90', format: 'Group', trial: 'true' }),
      ),
    ).toEqual({ offeringId: 'off-1', startsAtUtc: '2026-10-20T11:00:00Z', durationMinutes: 90, format: 'Group', trial: true });
  });

  it('leaves out anything malformed instead of passing it on', () => {
    expect(
      parseBookingPreselection(reader({ offeringId: '../etc', startsAtUtc: 'tomorrow', durationMinutes: '1.5', format: 'Triple', trial: 'yes' })),
    ).toEqual({ offeringId: undefined, startsAtUtc: undefined, durationMinutes: undefined, format: undefined, trial: false });
  });

  it('rejects a missing, zero, negative or absurd duration', () => {
    for (const durationMinutes of ['', '0', '-30', '99999']) {
      expect(parseBookingPreselection(reader({ durationMinutes })).durationMinutes).toBeUndefined();
    }
    expect(parseBookingPreselection(reader({})).durationMinutes).toBeUndefined();
  });

  it('defaults to no trial when the flag is anything but the exact string true', () => {
    expect(parseBookingPreselection(reader({ trial: 'TRUE' })).trial).toBe(false);
    expect(parseBookingPreselection(reader({})).trial).toBe(false);
  });
});

describe('findSlotStartingAt', () => {
  const slots = [slot('2026-10-20T11:00:00Z'), slot('2026-10-20T12:00:00Z')];

  it('matches by instant, so a differently formatted equal time still matches', () => {
    expect(findSlotStartingAt(slots, '2026-10-20T12:00:00.000Z')).toBe(slots[1]);
  });

  it('finds nothing for a time that is not offered, is unparseable or is absent', () => {
    expect(findSlotStartingAt(slots, '2026-10-20T13:00:00Z')).toBeUndefined();
    expect(findSlotStartingAt(slots, 'nonsense')).toBeUndefined();
    expect(findSlotStartingAt(slots, undefined)).toBeUndefined();
  });
});

describe('initialWeekIndex', () => {
  it('is 0 for a time in the first window and counts whole weeks after that (Bangkok days)', () => {
    // 2026-10-20T18:00Z is 21 Oct 01:00 in Bangkok.
    expect(initialWeekIndex('2026-10-14', '2026-10-14T05:00:00Z', 8)).toBe(0);
    expect(initialWeekIndex('2026-10-14', '2026-10-20T11:00:00Z', 8)).toBe(0);
    expect(initialWeekIndex('2026-10-14', '2026-10-20T18:00:00Z', 8)).toBe(1);
    expect(initialWeekIndex('2026-10-14', '2026-11-01T05:00:00Z', 8)).toBe(2);
  });

  it('is 0 for a past time, an unknown time or an unknown today', () => {
    expect(initialWeekIndex('2026-10-14', '2026-10-01T05:00:00Z', 8)).toBe(0);
    expect(initialWeekIndex('2026-10-14', undefined, 8)).toBe(0);
    expect(initialWeekIndex('', '2026-10-20T11:00:00Z', 8)).toBe(0);
  });

  it('never goes past the last window the tutor allows', () => {
    expect(initialWeekIndex('2026-10-14', '2027-10-14T05:00:00Z', 4)).toBe(4);
  });
});

describe('hold clock', () => {
  it('derives the server clock offset from serverTimeUtc', () => {
    const browserNow = Date.parse('2026-10-14T03:00:10Z');
    expect(serverClockOffsetMs('2026-10-14T03:00:00Z', browserNow)).toBe(-10_000);
    expect(serverClockOffsetMs('garbage', browserNow)).toBe(0);
  });

  it('counts the remaining hold on the server clock, not the device clock', () => {
    // The device clock runs 10 s ahead of the server: 12:00:10 on the device is 12:00:00 on the server.
    const offset = -10_000;
    const deviceNow = Date.parse('2026-10-14T12:00:10Z');
    expect(holdRemainingMs('2026-10-14T12:15:00Z', deviceNow, offset)).toBe(15 * 60_000);
  });

  it('never goes below zero, and is null without a hold or with an unparseable deadline', () => {
    expect(holdRemainingMs('2026-10-14T12:00:00Z', Date.parse('2026-10-14T13:00:00Z'), 0)).toBe(0);
    expect(holdRemainingMs(null, 0, 0)).toBeNull();
    expect(holdRemainingMs('soon', 0, 0)).toBeNull();
  });

  it('formats a countdown as m:ss, and h:mm:ss from an hour, rounding a started second up', () => {
    expect(formatCountdown(15 * 60_000)).toBe('15:00');
    expect(formatCountdown(61_000)).toBe('1:01');
    expect(formatCountdown(500)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5_000)).toBe('0:00');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
  });

  it('moves through plenty -> five minutes -> one minute -> over only at the documented thresholds', () => {
    expect(countdownStage(14 * 60_000)).toBe('plenty');
    expect(countdownStage(300_001)).toBe('plenty');
    expect(countdownStage(300_000)).toBe('fiveMinutes');
    expect(countdownStage(60_001)).toBe('fiveMinutes');
    expect(countdownStage(60_000)).toBe('oneMinute');
    expect(countdownStage(1)).toBe('oneMinute');
    expect(countdownStage(0)).toBe('over');
  });
});

describe('allowedDurationsOf / initialDurationOf', () => {
  it('offers exactly the lengths the profile says the deployment allows, ascending', () => {
    expect(allowedDurationsOf({ allowedDurationMinutes: [90, 45, 45] })).toEqual([45, 90]);
    expect(allowedDurationsOf({ allowedDurationMinutes: [30, 60, 90, 120, 150, 180] })).toEqual([30, 60, 90, 120, 150, 180]);
  });

  it('drops values that are not positive whole numbers', () => {
    expect(allowedDurationsOf({ allowedDurationMinutes: [0, -30, 1.5, 60, Number.NaN, 90] })).toEqual([60, 90]);
  });

  it('invents no lengths of its own: an empty list stays empty', () => {
    expect(allowedDurationsOf({ allowedDurationMinutes: [] })).toEqual([]);
  });

  it('starts on the requested length when it is allowed, else on 60 when allowed, else on the shortest allowed', () => {
    expect(initialDurationOf([30, 60, 90], 90)).toBe(90);
    expect(initialDurationOf([30, 60, 90], 45)).toBe(60);
    expect(initialDurationOf([30, 60, 90])).toBe(60);
    expect(initialDurationOf([45, 90], 60)).toBe(45);
    expect(initialDurationOf([45, 90])).toBe(45);
    expect(initialDurationOf([])).toBe(60);
  });
});
