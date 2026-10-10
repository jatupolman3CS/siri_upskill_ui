import { ApiError } from '../../../core/http/error.interceptor';
import { liveErrorKey, liveRefundBlockOf } from './live-errors';

function problem(status: number, details: Record<string, unknown> = {}): ApiError {
  return new ApiError(status, 'problem', undefined, { status, ...details });
}

describe('liveErrorKey', () => {
  it.each([
    ['live.not_found', 'live.errors.notFoundOrNoAccess'],
    ['live.session_cancelled', 'live.errors.cancelled'],
    ['live.session_ended', 'live.errors.ended'],
    ['live.window_not_open', 'live.errors.notOpenYet'],
    ['live.meeting_not_ready', 'live.errors.roomNotReady'],
    ['live.meetings_not_ready', 'live.errors.meetingsNotReady'],
    ['live.google_not_configured', 'live.errors.googleNotConfigured'],
    ['live.meeting_link_invalid', 'live.errors.linkInvalid'],
    ['live.meeting_link_host_not_allowed', 'live.errors.linkHostNotAllowed'],
    ['live.session_not_editable', 'live.errors.sessionNotEditable'],
    ['live.meeting_not_resyncable', 'live.errors.meetingNotResyncable'],
    ['live.session_not_started', 'live.errors.sessionNotStarted'],
    ['live.recording_asset_not_ready', 'live.errors.recordingAssetNotReady'],
    ['live.recording_asset_in_use', 'live.errors.recordingAssetInUse'],
    ['live.recording_episode_has_no_media', 'live.errors.recordingEpisodeHasNoMedia'],
    ['live.recording_episode_in_use', 'live.errors.recordingEpisodeInUse'],
    ['live.recording_not_available', 'live.errors.recordingNotAvailable'],
    ['live.recording_import_not_retryable', 'live.errors.recordingImportNotRetryable'],
    ['refund.live_attended', 'live.errors.refundLiveAttended'],
  ])('maps reason %s to %s', (reason, key) => {
    expect(liveErrorKey(problem(409, { reason }))).toBe(key);
  });

  it('maps a bare 429 to the rate-limit message', () => {
    expect(liveErrorKey(new ApiError(429, 'common.error'))).toBe('live.errors.rateLimited');
  });

  it('falls back to the generic message for unknown reasons and non-API errors', () => {
    expect(liveErrorKey(problem(409, { reason: 'something.new' }))).toBe('live.errors.generic');
    expect(liveErrorKey(problem(500))).toBe('live.errors.generic');
    expect(liveErrorKey(new Error('boom'))).toBe('live.errors.generic');
  });
});

describe('liveRefundBlockOf', () => {
  it('extracts the server figures from a 409 refund.live_attended', () => {
    const block = liveRefundBlockOf(
      problem(409, {
        reason: 'refund.live_attended',
        blockedCourseTitles: ['Excel Pro'],
        maxRefundableAmount: 500,
        blockedAmount: 1000,
      }),
    );
    expect(block).toEqual({ blockedCourseTitles: ['Excel Pro'], maxRefundableAmount: 500, blockedAmount: 1000 });
  });

  it('tolerates missing optional figures and clamps a negative maximum to zero', () => {
    expect(liveRefundBlockOf(problem(409, { reason: 'refund.live_attended' }))).toEqual({
      blockedCourseTitles: [],
      maxRefundableAmount: 0,
      blockedAmount: 0,
    });
    expect(liveRefundBlockOf(problem(409, { reason: 'refund.live_attended', maxRefundableAmount: -5 }))?.maxRefundableAmount).toBe(0);
  });

  it('returns null for every other failure so generic handling stays in charge', () => {
    expect(liveRefundBlockOf(problem(409, { reason: 'something.else' }))).toBeNull();
    expect(liveRefundBlockOf(problem(400, { reason: 'refund.live_attended' }))).toBeNull();
    expect(liveRefundBlockOf(new Error('network'))).toBeNull();
  });
});
