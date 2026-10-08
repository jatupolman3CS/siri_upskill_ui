import { ApiError } from '../../../../core/http/error.interceptor';
import { isSafeRoomUrl, isSessionId, joinFailureOf } from './live-join-state';

function problem(status: number, details: Record<string, unknown> = {}): ApiError {
  return new ApiError(status, 'problem', undefined, { status, ...details });
}

describe('joinFailureOf', () => {
  it('sends a 401 to sign-in rather than showing a screen', () => {
    expect(joinFailureOf(new ApiError(401, 'common.error'))).toEqual({ kind: 'unauthenticated' });
  });

  it('maps a bare 429 (no reason) to rateLimited', () => {
    expect(joinFailureOf(new ApiError(429, 'common.error'))).toEqual({ kind: 'rateLimited' });
  });

  it('maps live.not_found, and any 404, to the indistinguishable notFoundOrNoAccess', () => {
    expect(joinFailureOf(problem(404, { reason: 'live.not_found' }))).toEqual({ kind: 'notFoundOrNoAccess' });
    expect(joinFailureOf(problem(404))).toEqual({ kind: 'notFoundOrNoAccess' });
  });

  it('maps live.session_cancelled', () => {
    expect(joinFailureOf(problem(409, { reason: 'live.session_cancelled' }))).toEqual({ kind: 'cancelled' });
  });

  it('maps live.session_ended with the replay target when the server provides one', () => {
    expect(
      joinFailureOf(problem(409, { reason: 'live.session_ended', recordingEpisodeId: 'ep-1', courseSlug: 'excel-pro' })),
    ).toEqual({ kind: 'ended', recordingEpisodeId: 'ep-1', courseSlug: 'excel-pro' });
    expect(joinFailureOf(problem(409, { reason: 'live.session_ended' }))).toEqual({
      kind: 'ended',
      recordingEpisodeId: null,
      courseSlug: null,
    });
  });

  it('maps live.window_not_open with the opening time and a server-clock offset', () => {
    const failure = joinFailureOf(
      problem(409, {
        reason: 'live.window_not_open',
        opensAtUtc: '2026-10-08T02:45:00Z',
        serverTimeUtc: '2026-10-08T02:00:00Z',
      }),
    );
    expect(failure.kind).toBe('notOpen');
    if (failure.kind === 'notOpen') {
      expect(failure.opensAtUtc).toBe('2026-10-08T02:45:00Z');
      expect(Number.isFinite(failure.offsetMs)).toBe(true);
    }
  });

  it('maps live.meeting_not_ready (503) to roomNotReady', () => {
    expect(joinFailureOf(problem(503, { reason: 'live.meeting_not_ready' }))).toEqual({ kind: 'roomNotReady' });
  });

  it('treats an unrecognised failure, a bare 503 and a non-ApiError as the generic error', () => {
    expect(joinFailureOf(problem(500))).toEqual({ kind: 'error' });
    expect(joinFailureOf(problem(503))).toEqual({ kind: 'error' });
    expect(joinFailureOf(problem(409, { reason: 'something.new' }))).toEqual({ kind: 'error' });
    expect(joinFailureOf(new Error('network'))).toEqual({ kind: 'error' });
  });
});

describe('isSessionId', () => {
  it('accepts a GUID and rejects anything else', () => {
    expect(isSessionId('0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
    expect(isSessionId('')).toBe(false);
    expect(isSessionId('../../etc/passwd')).toBe(false);
    expect(isSessionId('123')).toBe(false);
  });
});

describe('isSafeRoomUrl', () => {
  it('only allows absolute https URLs', () => {
    expect(isSafeRoomUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isSafeRoomUrl('http://meet.google.com/abc-defg-hij')).toBe(false);
    expect(isSafeRoomUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeRoomUrl('data:text/html,<b>x</b>')).toBe(false);
    expect(isSafeRoomUrl('//meet.google.com/abc')).toBe(false);
    expect(isSafeRoomUrl('not a url')).toBe(false);
  });
});
