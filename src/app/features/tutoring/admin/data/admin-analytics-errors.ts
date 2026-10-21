import { ApiError } from '../../../../core/http/error.interceptor';
import { tutoringProblemOf, tutoringReasonOf } from '../../data/tutoring-errors';
import { tutoringAdminErrorKey } from './admin-errors';

/** The i18n key that explains a failed analytics call, plus the number its wording names (a limit), if any. */
export interface AnalyticsErrorText {
  readonly key: string;
  readonly params?: Readonly<Record<string, number>>;
}

/** Extension members of an analytics refusal (P13-15 section 11): the limit that was exceeded. A `status` / `detail` extension would be dropped by the server. */
interface RangeExtras {
  readonly maxDays?: number;
  readonly maxMonths?: number;
  readonly maxBuckets?: number;
}

const REASON_RANGE_INVALID = 'tutoring.analytics_range_invalid';
const REASON_BUSY = 'tutoring.analytics_busy';
const REASON_TIMEOUT = 'tutoring.analytics_timeout';

/** `503 tutoring.analytics_busy`: the server is already running its limit of reports; trying again a few seconds later works. */
export function isAnalyticsBusy(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && tutoringReasonOf(error) === REASON_BUSY;
}

/**
 * Words for a failed analytics call. The server's `title` is never shown. A refused range names the limit the server gave (days, months or
 * buckets); everything that is not specific to analytics reads through the administrator error map, so a failure says the same thing as on the
 * other administrator screens.
 */
export function analyticsErrorOf(error: unknown): AnalyticsErrorText {
  if (error instanceof ApiError) {
    const reason = tutoringReasonOf(error);
    if (reason === REASON_RANGE_INVALID) {
      const extras = (tutoringProblemOf(error) ?? {}) as RangeExtras;
      if (typeof extras.maxDays === 'number') {
        return { key: 'tutoring.admin.errors.analyticsRangeDays', params: { max: extras.maxDays } };
      }
      if (typeof extras.maxMonths === 'number') {
        return { key: 'tutoring.admin.errors.analyticsRangeMonths', params: { max: extras.maxMonths } };
      }
      if (typeof extras.maxBuckets === 'number') {
        return { key: 'tutoring.admin.errors.analyticsRangeBuckets', params: { max: extras.maxBuckets } };
      }
      return { key: 'tutoring.admin.errors.analyticsRangeInvalid' };
    }
    if (reason === REASON_BUSY) {
      return { key: 'tutoring.admin.errors.analyticsBusy' };
    }
    if (reason === REASON_TIMEOUT) {
      return { key: 'tutoring.admin.errors.analyticsTimeout' };
    }
    if (error.status === 404 && reason === 'tutoring.not_found') {
      // The whole feature is switched off on the server (`Tutoring:Analytics:Enabled = false` answers 404 everywhere).
      return { key: 'tutoring.admin.errors.analyticsDisabled' };
    }
  }
  return { key: tutoringAdminErrorKey(error) };
}
