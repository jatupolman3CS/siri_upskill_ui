import { ApiError } from '../../../../core/http/error.interceptor';
import { TUTORING_EN as en, TUTORING_TH as th } from '../../testing/tutoring-i18n';
import { analyticsErrorOf, isAnalyticsBusy } from './admin-analytics-errors';

function problem(status: number, reason?: string, extra: object = {}): ApiError {
  return new ApiError(status, 'x', 'validation', { status, reason, ...extra });
}

function hasKey(dictionary: unknown, key: string): boolean {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary) !== undefined;
}

describe('analyticsErrorOf', () => {
  it('names the limit the server gave when it refuses a period in days, months or columns', () => {
    expect(analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid', { maxDays: 92 }))).toEqual({ key: 'tutoring.admin.errors.analyticsRangeDays', params: { max: 92 } });
    expect(analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid', { maxMonths: 24 }))).toEqual({ key: 'tutoring.admin.errors.analyticsRangeMonths', params: { max: 24 } });
    expect(analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid', { maxBuckets: 120 }))).toEqual({ key: 'tutoring.admin.errors.analyticsRangeBuckets', params: { max: 120 } });
  });

  it('falls back to a general "cannot use that period" when the refusal names no limit', () => {
    expect(analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid'))).toEqual({ key: 'tutoring.admin.errors.analyticsRangeInvalid' });
  });

  it('words the busy and timeout answers, and the switched-off feature (404 not_found)', () => {
    expect(analyticsErrorOf(problem(503, 'tutoring.analytics_busy')).key).toBe('tutoring.admin.errors.analyticsBusy');
    expect(analyticsErrorOf(problem(503, 'tutoring.analytics_timeout')).key).toBe('tutoring.admin.errors.analyticsTimeout');
    expect(analyticsErrorOf(problem(404, 'tutoring.not_found')).key).toBe('tutoring.admin.errors.analyticsDisabled');
  });

  it('reads everything else through the administrator error map, so a failure says the same as on the other screens', () => {
    expect(analyticsErrorOf(problem(403)).key).toBe('tutoring.admin.errors.forbidden');
    expect(analyticsErrorOf(problem(429)).key).toBe('tutoring.errors.rateLimited');
    expect(analyticsErrorOf(new Error('network')).key).toBe('tutoring.errors.generic');
  });

  it('only ever points at texts that exist in both languages', () => {
    const keys = [
      analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid', { maxDays: 1 })).key,
      analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid', { maxMonths: 1 })).key,
      analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid', { maxBuckets: 1 })).key,
      analyticsErrorOf(problem(400, 'tutoring.analytics_range_invalid')).key,
      analyticsErrorOf(problem(503, 'tutoring.analytics_busy')).key,
      analyticsErrorOf(problem(503, 'tutoring.analytics_timeout')).key,
      analyticsErrorOf(problem(404, 'tutoring.not_found')).key,
    ];
    for (const key of keys) {
      expect(hasKey(th, key), key).toBe(true);
      expect(hasKey(en, key), key).toBe(true);
    }
  });
});

describe('isAnalyticsBusy', () => {
  it('is true only for the 503 that says the server is busy', () => {
    expect(isAnalyticsBusy(problem(503, 'tutoring.analytics_busy'))).toBe(true);
    expect(isAnalyticsBusy(problem(503, 'tutoring.analytics_timeout'))).toBe(false);
    expect(isAnalyticsBusy(problem(500, 'tutoring.analytics_busy'))).toBe(false);
    expect(isAnalyticsBusy(new Error('x'))).toBe(false);
  });
});
