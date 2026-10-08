import {
  BOUNDARY_SLACK_MS,
  MAX_TIMER_MS,
  type BoundarySession,
  clockOffsetMs,
  countdownParts,
  msUntil,
  nextBoundaryDelayMs,
} from './live-clock';

const NOW = Date.parse('2026-10-08T02:00:00Z');

function session(overrides: Partial<BoundarySession> = {}): BoundarySession {
  return {
    displayState: 'Upcoming',
    joinOpensAtUtc: '2026-10-08T02:45:00Z',
    startsAtUtc: '2026-10-08T03:00:00Z',
    endsAtUtc: '2026-10-08T05:00:00Z',
    ...overrides,
  };
}

describe('clockOffsetMs / msUntil', () => {
  it('measures how far the device clock is behind the server clock', () => {
    // Server says 02:00:10 while the device thinks it is 02:00:00 -> the device is 10 s behind.
    expect(clockOffsetMs('2026-10-08T02:00:10Z', NOW)).toBe(10_000);
  });

  it('falls back to a zero offset for an unparseable server stamp', () => {
    expect(clockOffsetMs('not-a-date', NOW)).toBe(0);
  });

  it('counts down to a target using the server-corrected clock', () => {
    // 45 minutes away on the device clock, but the device is 10 s behind the server -> only 44m50s remain.
    expect(msUntil('2026-10-08T02:45:00Z', 10_000, NOW)).toBe(44 * 60_000 + 50_000);
  });

  it('goes negative once the target has passed and returns null for garbage', () => {
    expect(msUntil('2026-10-08T01:59:00Z', 0, NOW)).toBe(-60_000);
    expect(msUntil('nope', 0, NOW)).toBeNull();
  });
});

describe('countdownParts', () => {
  it('splits a duration into days, hours, minutes and seconds', () => {
    const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    expect(countdownParts(ms)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it('treats negative and fractional input as a clamped, floored value', () => {
    expect(countdownParts(-5_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(countdownParts(1_999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });
});

describe('nextBoundaryDelayMs', () => {
  it('targets the soonest future boundary of any session, plus slack', () => {
    const delay = nextBoundaryDelayMs([session()], 0, NOW);
    expect(delay).toBe(45 * 60_000 + BOUNDARY_SLACK_MS);
  });

  it('moves on to the next boundary once the join window has opened', () => {
    const live = session({ displayState: 'Live' });
    const delay = nextBoundaryDelayMs([live], 0, Date.parse('2026-10-08T02:50:00Z'));
    expect(delay).toBe(10 * 60_000 + BOUNDARY_SLACK_MS); // next is startsAtUtc
  });

  it('takes the minimum across several sessions', () => {
    const later = session({ joinOpensAtUtc: '2026-10-09T02:45:00Z', startsAtUtc: '2026-10-09T03:00:00Z', endsAtUtc: '2026-10-09T05:00:00Z' });
    expect(nextBoundaryDelayMs([later, session()], 0, NOW)).toBe(45 * 60_000 + BOUNDARY_SLACK_MS);
  });

  it('honours the server clock offset', () => {
    // Device 10 s behind the server: the boundary arrives 10 s sooner on the device timeline.
    expect(nextBoundaryDelayMs([session()], 10_000, NOW)).toBe(45 * 60_000 - 10_000 + BOUNDARY_SLACK_MS);
  });

  it('ignores ended and cancelled sessions', () => {
    expect(nextBoundaryDelayMs([session({ displayState: 'Ended' }), session({ displayState: 'Cancelled' })], 0, NOW)).toBeNull();
  });

  it('returns null when every boundary is already in the past', () => {
    expect(nextBoundaryDelayMs([session({ displayState: 'Live' })], 0, Date.parse('2026-10-09T00:00:00Z'))).toBeNull();
  });

  it('never schedules a timer too far away for setTimeout to honour', () => {
    const far = session({ joinOpensAtUtc: '2027-12-01T00:00:00Z', startsAtUtc: '2027-12-01T01:00:00Z', endsAtUtc: '2027-12-01T02:00:00Z' });
    expect(nextBoundaryDelayMs([far], 0, NOW)).toBeNull();
    expect(MAX_TIMER_MS).toBe(2_147_483_647);
  });
});
