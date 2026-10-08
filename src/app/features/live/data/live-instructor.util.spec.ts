import { ApiError } from '../../../core/http/error.interceptor';
import type { InstructorMeetingSummary } from './live-instructor.models';
import {
  addDaysToDate,
  bangkokToUtcIso,
  hasWaitingMeeting,
  instructorProblemMessage,
  isHttpsUrl,
  minutesBetween,
  meetingErrorKey,
  meetingStatusView,
  parseGoogleCallback,
  sessionWriteProblemMessage,
  utcToBangkokParts,
} from './live-instructor.util';

function meeting(overrides: Partial<InstructorMeetingSummary> = {}): InstructorMeetingSummary {
  return {
    sessionId: 's1',
    provider: 'GoogleMeet',
    syncStatus: 'Synced',
    hasMeetingLink: true,
    isUsable: true,
    lastSyncAtUtc: null,
    needsAction: 'None',
    errorCode: null,
    ...overrides,
  };
}

describe('Bangkok <-> UTC conversion', () => {
  it('converts a Bangkok wall-clock time to UTC with a trailing Z (never an offset)', () => {
    expect(bangkokToUtcIso('2026-10-08', '10:00')).toBe('2026-10-08T03:00:00Z');
  });

  it('rolls the date back when Bangkok time is before 07:00 (crosses UTC midnight)', () => {
    expect(bangkokToUtcIso('2026-10-08', '06:30')).toBe('2026-10-07T23:30:00Z');
    expect(bangkokToUtcIso('2026-01-01', '00:00')).toBe('2025-12-31T17:00:00Z');
  });

  it('never emits an offset or milliseconds', () => {
    const iso = bangkokToUtcIso('2026-10-08', '10:00');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
    expect(iso).not.toContain('+');
  });

  it('rejects impossible calendar dates instead of silently rolling over', () => {
    expect(bangkokToUtcIso('2026-02-31', '10:00')).toBeNull();
    expect(bangkokToUtcIso('2026-13-01', '10:00')).toBeNull();
  });

  it('rejects malformed or out-of-range input', () => {
    expect(bangkokToUtcIso('', '10:00')).toBeNull();
    expect(bangkokToUtcIso('2026-10-08', '')).toBeNull();
    expect(bangkokToUtcIso('2026-10-08', '24:00')).toBeNull();
    expect(bangkokToUtcIso('2026-10-08', '10:60')).toBeNull();
    expect(bangkokToUtcIso('08/10/2026', '10:00')).toBeNull();
  });

  it('round-trips through utcToBangkokParts', () => {
    for (const [date, time] of [
      ['2026-10-08', '10:00'],
      ['2026-10-08', '06:30'],
      ['2026-12-31', '23:59'],
      ['2027-01-01', '00:00'],
    ] as const) {
      const iso = bangkokToUtcIso(date, time);
      expect(iso).not.toBeNull();
      expect(utcToBangkokParts(iso as string)).toEqual({ date, time });
    }
  });

  it('utcToBangkokParts returns null for an unparseable instant', () => {
    expect(utcToBangkokParts('not-a-date')).toBeNull();
  });
});

describe('isHttpsUrl', () => {
  it('accepts only https URLs', () => {
    expect(isHttpsUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isHttpsUrl('  https://zoom.us/j/123  ')).toBe(true);
    expect(isHttpsUrl('http://meet.google.com/abc')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('meet.google.com/abc')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
  });
});

describe('parseGoogleCallback', () => {
  const reader = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

  it('returns null when the page was opened without a callback', () => {
    expect(parseGoogleCallback(reader({}))).toBeNull();
    expect(parseGoogleCallback(reader({ google: 'whatever' }))).toBeNull();
  });

  it('recognises a successful connection', () => {
    expect(parseGoogleCallback(reader({ google: 'connected' }))).toEqual({ outcome: 'connected' });
  });

  it('recognises each documented error reason', () => {
    for (const reason of ['access_denied', 'state_invalid', 'scope_missing', 'no_refresh_token', 'exchange_failed']) {
      expect(parseGoogleCallback(reader({ google: 'error', reason }))).toEqual({ outcome: 'error', reason });
    }
  });

  it('maps an unknown or missing reason to null instead of echoing it', () => {
    expect(parseGoogleCallback(reader({ google: 'error', reason: '<script>' }))).toEqual({ outcome: 'error', reason: null });
    expect(parseGoogleCallback(reader({ google: 'error' }))).toEqual({ outcome: 'error', reason: null });
  });
});

describe('meetingStatusView (needsAction -> UI)', () => {
  it('maps every needsAction to a distinct text key plus an icon', () => {
    const views = {
      Waiting: meetingStatusView(meeting({ needsAction: 'Waiting', syncStatus: 'Pending', hasMeetingLink: false, isUsable: false })),
      PasteLink: meetingStatusView(meeting({ needsAction: 'PasteLink', syncStatus: 'AwaitingLink', hasMeetingLink: false, isUsable: false })),
      ReconnectGoogle: meetingStatusView(meeting({ needsAction: 'ReconnectGoogle', syncStatus: 'NeedsReconnect' })),
      Retry: meetingStatusView(meeting({ needsAction: 'Retry', syncStatus: 'Failed', hasMeetingLink: false, isUsable: false })),
      None: meetingStatusView(meeting()),
    };

    expect(views.Waiting).toMatchObject({ labelKey: 'live.instructor.meeting.waiting', tone: 'info' });
    expect(views.PasteLink).toMatchObject({ labelKey: 'live.instructor.meeting.pasteLink', tone: 'warning' });
    expect(views.ReconnectGoogle).toMatchObject({ labelKey: 'live.instructor.meeting.reconnectGoogle', tone: 'warning' });
    expect(views.Retry).toMatchObject({ labelKey: 'live.instructor.meeting.retry', tone: 'danger' });
    expect(views.None).toMatchObject({ labelKey: 'live.instructor.meeting.ready', tone: 'success' });
    const labels = Object.values(views).map((view) => view.labelKey);
    expect(new Set(labels).size).toBe(labels.length);
    expect(Object.values(views).every((view) => view.icon.startsWith('phosphor'))).toBe(true);
  });

  it('shows a removed room as neutral, and an unusable "None" as unavailable', () => {
    expect(meetingStatusView(meeting({ syncStatus: 'Deleted', isUsable: false, hasMeetingLink: false })).labelKey).toBe(
      'live.instructor.meeting.removed',
    );
    expect(meetingStatusView(meeting({ syncStatus: 'PendingDelete' })).labelKey).toBe('live.instructor.meeting.removed');
    expect(meetingStatusView(meeting({ isUsable: false, hasMeetingLink: false })).labelKey).toBe(
      'live.instructor.meeting.unavailable',
    );
  });
});

describe('meetingErrorKey', () => {
  it('returns null for no error, a specific key for known codes and a generic key otherwise', () => {
    expect(meetingErrorKey(null)).toBeNull();
    expect(meetingErrorKey('conference_pending')).toBe('live.instructor.meetingError.conference_pending');
    expect(meetingErrorKey('invalid_grant')).toBe('live.instructor.meetingError.invalid_grant');
    expect(meetingErrorKey('some_new_code')).toBe('live.instructor.meetingError.unknown');
  });
});

describe('hasWaitingMeeting (the only condition that starts polling)', () => {
  it('is true only when at least one room is Waiting', () => {
    expect(hasWaitingMeeting([])).toBe(false);
    expect(hasWaitingMeeting([meeting(), meeting({ needsAction: 'PasteLink' })])).toBe(false);
    expect(hasWaitingMeeting([meeting(), meeting({ needsAction: 'Waiting' })])).toBe(true);
  });
});

describe('instructorProblemMessage', () => {
  const problem = (status: number, details: Record<string, unknown>) =>
    new ApiError(status, 'x', 'validation', { status, ...details });

  it('delegates to the shared live error map so a failure reads the same on every Live screen', () => {
    expect(instructorProblemMessage(problem(404, { reason: 'live.not_found' })).key).toBe('live.errors.notFoundOrNoAccess');
    expect(instructorProblemMessage(problem(400, { reason: 'live.meeting_link_invalid' })).key).toBe('live.errors.linkInvalid');
    expect(instructorProblemMessage(problem(409, { reason: 'live.recording_asset_not_ready' })).key).toBe(
      'live.errors.recordingAssetNotReady',
    );
  });

  it('always supplies the allowed hosts and the number of unready sessions as params', () => {
    const host = instructorProblemMessage(problem(400, { reason: 'live.meeting_link_host_not_allowed' }));
    expect(host.key).toBe('live.errors.linkHostNotAllowed');
    expect(host.params?.['hosts']).toContain('meet.google.com');

    const notReady = instructorProblemMessage(problem(400, { reason: 'live.meetings_not_ready', sessionIds: ['a', 'b'] }));
    expect(notReady.key).toBe('live.errors.meetingsNotReady');
    expect(notReady.params?.['count']).toBe(2);
  });

  it('treats 429 as rate limited, and unknown failures as generic (never echoing server text)', () => {
    expect(instructorProblemMessage(new ApiError(429, 'x')).key).toBe('live.errors.rateLimited');
    expect(instructorProblemMessage(problem(500, { reason: 'something.new' })).key).toBe('live.errors.generic');
    expect(instructorProblemMessage(new Error('boom')).key).toBe('live.errors.generic');
  });

  it('reads a reason-less 404 from a Catalog route as "not found" rather than generic', () => {
    expect(instructorProblemMessage(new ApiError(404, 'x')).key).toBe('live.errors.notFoundOrNoAccess');
  });
});


describe('addDaysToDate / minutesBetween', () => {
  it('adds calendar days across month and year ends', () => {
    expect(addDaysToDate('2026-10-08', 1)).toBe('2026-10-09');
    expect(addDaysToDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToDate('nope', 1)).toBeNull();
  });

  it('measures the length of a session in minutes', () => {
    expect(minutesBetween('2026-10-08T03:00:00Z', '2026-10-08T05:30:00Z')).toBe(150);
    expect(minutesBetween('2026-10-08T05:00:00Z', '2026-10-08T03:00:00Z')).toBe(-120);
    expect(minutesBetween('x', '2026-10-08T03:00:00Z')).toBeNull();
  });
});

describe('sessionWriteProblemMessage', () => {
  it('reads a plain 400 as a bad time range and a plain 409 as an overlap', () => {
    expect(sessionWriteProblemMessage(new ApiError(400, 'x', 'validation', { status: 400 })).key).toBe('live.builder.form.errorTime');
    expect(sessionWriteProblemMessage(new ApiError(409, 'x', 'conflict', { status: 409 })).key).toBe('live.builder.form.errorConflict');
  });

  it('still maps a known Live reason through the shared map, and keeps 429 / 500 generic', () => {
    expect(
      sessionWriteProblemMessage(new ApiError(409, 'x', 'conflict', { status: 409, reason: 'live.session_not_editable' })).key,
    ).toBe('live.errors.sessionNotEditable');
    expect(sessionWriteProblemMessage(new ApiError(429, 'x')).key).toBe('live.errors.rateLimited');
    expect(sessionWriteProblemMessage(new ApiError(500, 'x')).key).toBe('live.errors.generic');
  });
});
