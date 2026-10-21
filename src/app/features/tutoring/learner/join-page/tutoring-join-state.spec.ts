import { ApiError } from '../../../../core/http/error.interceptor';
import { tutorClassRoute, tutorMustActOnRoom, tutoringJoinFailureOf } from './tutoring-join-state';

function problem(status: number, reason?: string, extra: object = {}): ApiError {
  return new ApiError(status, 'x', 'conflict', { status, reason, ...extra });
}

describe('tutoringJoinFailureOf', () => {
  it('reads a 404 as "not found or no access" - the two are deliberately indistinguishable', () => {
    expect(tutoringJoinFailureOf(problem(404, 'tutoring.not_found'))).toEqual({ kind: 'notFoundOrNoAccess' });
    expect(tutoringJoinFailureOf(new ApiError(404, 'x'))).toEqual({ kind: 'notFoundOrNoAccess' });
  });

  it.each([
    ['tutoring.session_cancelled', 'cancelled'],
    ['tutoring.session_closed', 'closed'],
    ['tutoring.session_ended', 'ended'],
  ] as const)('reads %s as the %s screen', (reason, kind) => {
    expect(tutoringJoinFailureOf(problem(409, reason))).toEqual({ kind });
  });

  it('reads window_not_open with when it opens and the offset between the server clock and this device', () => {
    const serverTimeUtc = new Date(Date.now() + 120_000).toISOString();
    const failure = tutoringJoinFailureOf(problem(409, 'tutoring.window_not_open', { opensAtUtc: '2026-10-20T10:45:00Z', serverTimeUtc }));

    expect(failure.kind).toBe('notOpen');
    if (failure.kind === 'notOpen') {
      expect(failure.opensAtUtc).toBe('2026-10-20T10:45:00Z');
      expect(failure.offsetMs).toBeGreaterThan(110_000);
      expect(failure.offsetMs).toBeLessThan(130_000);
    }
  });

  it('trusts the device clock (offset 0) when the server clock is missing, and has no opening time to count to', () => {
    expect(tutoringJoinFailureOf(problem(409, 'tutoring.window_not_open'))).toEqual({ kind: 'notOpen', opensAtUtc: null, offsetMs: 0 });
  });

  it('reads room_not_ready, carrying what the tutor can do about the room when the server said so', () => {
    expect(tutoringJoinFailureOf(problem(503, 'tutoring.room_not_ready', { needsAction: 'PasteLink' }))).toEqual({ kind: 'roomNotReady', needsAction: 'PasteLink' });
    expect(tutoringJoinFailureOf(problem(503, 'tutoring.room_not_ready'))).toEqual({ kind: 'roomNotReady', needsAction: null });
  });

  it('reads 401 as "sign in" (not a screen) and 429 by its status alone', () => {
    expect(tutoringJoinFailureOf(new ApiError(401, 'x'))).toEqual({ kind: 'unauthenticated' });
    expect(tutoringJoinFailureOf(new ApiError(429, 'x'))).toEqual({ kind: 'rateLimited' });
  });

  it('reads anything else - a concurrent update, a server failure, a non-ApiError - as the generic error', () => {
    expect(tutoringJoinFailureOf(problem(409, 'tutoring.concurrent_update'))).toEqual({ kind: 'error' });
    expect(tutoringJoinFailureOf(problem(500, 'tutoring.something_new'))).toEqual({ kind: 'error' });
    expect(tutoringJoinFailureOf(new Error('boom'))).toEqual({ kind: 'error' });
    expect(tutoringJoinFailureOf(undefined)).toEqual({ kind: 'error' });
  });
});

describe('tutorMustActOnRoom', () => {
  it.each(['PasteLink', 'ReconnectGoogle', 'Retry'])('is true when the server asks the tutor to %s', (action) => {
    expect(tutorMustActOnRoom(action)).toBe(true);
  });

  it.each([null, 'None', 'Waiting'])('is false for %s', (action) => {
    expect(tutorMustActOnRoom(action)).toBe(false);
  });
});

describe('tutorClassRoute', () => {
  it('points at the tutor\'s page for the class', () => {
    expect(tutorClassRoute('s-1')).toEqual(['/instructor/tutoring/classes', 's-1']);
  });
});
