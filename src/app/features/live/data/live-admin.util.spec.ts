import { adminVerdict, durationView, jobStateTone, relativeTime, warningView } from './live-admin.util';

describe('adminVerdict', () => {
  it('is "ready" only when the server reported no warnings', () => {
    expect(adminVerdict({ warnings: [] })).toBe('ready');
    expect(adminVerdict({ warnings: ['no_job_server'] })).toBe('attention');
    expect(adminVerdict({ warnings: ['something_new'] })).toBe('attention');
  });
});

describe('warningView', () => {
  it.each([
    'no_job_server',
    'email_unconfigured',
    'outbox_backlog',
    'public_base_url_not_https',
    'google_not_configured',
    'meetings_stuck_pending',
  ])('maps %s to its own title / impact / action keys', (code) => {
    expect(warningView(code)).toEqual({
      code,
      known: true,
      titleKey: `admin.liveStatus.warnings.${code}.title`,
      impactKey: `admin.liveStatus.warnings.${code}.impact`,
      actionKey: `admin.liveStatus.warnings.${code}.action`,
    });
  });

  it('falls back to the generic message for an unrecognised code, keeping the code for diagnostics', () => {
    expect(warningView('brand_new_code')).toEqual({
      code: 'brand_new_code',
      known: false,
      titleKey: 'admin.liveStatus.warnings.unknown.title',
      impactKey: 'admin.liveStatus.warnings.unknown.impact',
      actionKey: 'admin.liveStatus.warnings.unknown.action',
    });
  });
});

describe('relativeTime (measured against the server clock)', () => {
  const NOW = '2026-10-09T10:00:00Z';

  it('reads a tiny difference as just now / in a moment', () => {
    expect(relativeTime('2026-10-09T09:59:58Z', NOW)).toEqual({ key: 'admin.liveStatus.time.justNow', count: 0 });
    expect(relativeTime('2026-10-09T10:00:03Z', NOW)).toEqual({ key: 'admin.liveStatus.time.soon', count: 0 });
  });

  it.each([
    ['2026-10-09T09:59:30Z', 'secondsAgo', 30],
    ['2026-10-09T09:55:00Z', 'minutesAgo', 5],
    ['2026-10-09T07:00:00Z', 'hoursAgo', 3],
    ['2026-10-07T10:00:00Z', 'daysAgo', 2],
    ['2026-10-09T10:00:45Z', 'secondsIn', 45],
    ['2026-10-09T10:05:00Z', 'minutesIn', 5],
    ['2026-10-09T13:00:00Z', 'hoursIn', 3],
    ['2026-10-12T10:00:00Z', 'daysIn', 3],
  ])('%s -> %s (%d)', (iso, unit, count) => {
    expect(relativeTime(iso, NOW)).toEqual({ key: `admin.liveStatus.time.${unit}`, count });
  });

  it('rounds down to the unit (59 minutes is not "1 hour")', () => {
    expect(relativeTime('2026-10-09T09:01:00Z', NOW)).toEqual({ key: 'admin.liveStatus.time.minutesAgo', count: 59 });
  });

  it('returns null for a missing or unparseable instant', () => {
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime(undefined, NOW)).toBeNull();
    expect(relativeTime('not a date', NOW)).toBeNull();
    expect(relativeTime('2026-10-09T09:00:00Z', 'garbage')).toBeNull();
  });
});

describe('durationView', () => {
  it.each([
    [0, 'seconds', 0],
    [59, 'seconds', 59],
    [60, 'minutes', 1],
    [3599, 'minutes', 59],
    [3600, 'hours', 1],
    [86_399, 'hours', 23],
    [86_400, 'days', 1],
    [200_000, 'days', 2],
  ])('%d s -> %s (%d)', (seconds, unit, count) => {
    expect(durationView(seconds)).toEqual({ key: `admin.liveStatus.duration.${unit}`, count });
  });

  it('returns null when there is nothing waiting or the value is unusable', () => {
    expect(durationView(null)).toBeNull();
    expect(durationView(undefined)).toBeNull();
    expect(durationView(-1)).toBeNull();
    expect(durationView(Number.NaN)).toBeNull();
  });
});

describe('jobStateTone', () => {
  it('flags only a failed run as danger and only success as success', () => {
    expect(jobStateTone('Succeeded')).toBe('success');
    expect(jobStateTone('Failed')).toBe('danger');
    expect(jobStateTone('Processing')).toBe('neutral');
    expect(jobStateTone(null)).toBe('neutral');
  });
});
