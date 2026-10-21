import { bangkokDateOf, bangkokDateOfInstant, buildSlotDays, daysBetweenDates, slotWindowRange } from './tutor-slots.util';
import type { TutorSlot } from './tutoring-public.models';

function slot(startsAtUtc: string, endsAtUtc: string): TutorSlot {
  return { startsAtUtc, endsAtUtc, seatsLeft: 1, joinsExistingGroup: false };
}

describe('bangkokDateOf', () => {
  it('rolls the date forward once UTC+7 passes midnight', () => {
    // 17:00Z is exactly 00:00 the next day in Bangkok; 16:59Z is still the same day.
    expect(bangkokDateOf(Date.parse('2026-10-13T16:59:59Z'))).toBe('2026-10-13');
    expect(bangkokDateOf(Date.parse('2026-10-13T17:00:00Z'))).toBe('2026-10-14');
  });
});

describe('bangkokDateOfInstant', () => {
  it('returns the Bangkok calendar day of an instant and null for garbage', () => {
    expect(bangkokDateOfInstant('2026-10-14T02:00:00Z')).toBe('2026-10-14');
    expect(bangkokDateOfInstant('2026-10-14T18:30:00Z')).toBe('2026-10-15');
    expect(bangkokDateOfInstant('not-a-date')).toBeNull();
  });
});

describe('slotWindowRange', () => {
  it('spans whole Bangkok days as a half-open UTC range', () => {
    expect(slotWindowRange('2026-10-14', 7)).toEqual({ fromUtc: '2026-10-13T17:00:00Z', toUtc: '2026-10-20T17:00:00Z' });
  });

  it('stays within the 31 day maximum for a one-week window and rejects a bad date', () => {
    expect(slotWindowRange('nope', 7)).toBeNull();
  });
});

describe('daysBetweenDates', () => {
  it('counts whole days between calendar dates', () => {
    expect(daysBetweenDates('2026-10-14', '2026-10-21')).toBe(7);
    expect(daysBetweenDates('2026-10-14', '2026-10-14')).toBe(0);
    expect(daysBetweenDates('x', '2026-10-14')).toBe(0);
  });
});

describe('buildSlotDays', () => {
  it('creates the requested number of consecutive days, empty days included', () => {
    const days = buildSlotDays('2026-10-14', 7, []);
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(days.every((d) => d.slots.length === 0)).toBe(true);
  });

  it('files each slot under the Bangkok day it starts on, in order, across the UTC date boundary', () => {
    const early = slot('2026-10-14T02:00:00Z', '2026-10-14T03:00:00Z'); // 09:00 on 14th in Bangkok
    const lateUtc = slot('2026-10-14T17:30:00Z', '2026-10-14T18:30:00Z'); // 00:30 on the 15th in Bangkok
    const nextDay = slot('2026-10-15T03:00:00Z', '2026-10-15T04:00:00Z');
    const days = buildSlotDays('2026-10-14', 3, [early, lateUtc, nextDay]);

    expect(days[0].slots).toEqual([early]);
    expect(days[1].slots).toEqual([lateUtc, nextDay]);
    expect(days[2].slots).toEqual([]);
  });

  it('ignores slots that start outside the window', () => {
    const outside = slot('2026-10-30T02:00:00Z', '2026-10-30T03:00:00Z');
    expect(buildSlotDays('2026-10-14', 7, [outside]).flatMap((d) => d.slots)).toEqual([]);
  });

  it('gives every day a noon instant that renders on its own Bangkok date', () => {
    const [first] = buildSlotDays('2026-10-14', 1, []);
    expect(first.noonUtc).toBe('2026-10-14T05:00:00Z');
    expect(bangkokDateOfInstant(first.noonUtc)).toBe('2026-10-14');
  });
});
