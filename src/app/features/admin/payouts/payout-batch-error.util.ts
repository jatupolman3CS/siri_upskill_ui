import { ApiError } from '../../../core/http/error.interceptor';

/**
 * Reading the failures of the admin payout screen. In production every failed call reaches a component as an `ApiError`
 * (`core/http/error.interceptor.ts`): its `message` is the ProblemDetails `detail ?? title`, its `code` the `errorCode` extension, and the
 * WHOLE ProblemDetails body is `details`. ASP.NET writes a feature's extensions (`DomainError.Extensions`, see
 * `DomainErrorHttpResults.ToProblemHttpResult`) as top-level members of that body - there is no nested `extensions` object and no
 * `HttpErrorResponse.error` on what a component receives.
 */

/** `TutoringPayoutBatchService.NothingToPayReason`. */
export const NOTHING_TO_PAY_REASON = 'payout.nothing_to_pay';

/** The `message` an `ApiError` carries when the body had no `detail`/`title` - an i18n-shaped placeholder, not display text. */
const NO_SERVER_MESSAGE = 'common.error';

/** Stable `reason` of a payout failure -> i18n key. The reasons `POST admin/batches` can answer, from `PayoutBatchService` and `TutoringPayoutBatchService`. */
const REASON_KEYS: Readonly<Record<string, string>> = {
  'payout.invalid_period_key': 'admin.payouts.errors.reasons.invalidPeriodKey',
  'payout.period_not_started': 'admin.payouts.errors.reasons.periodNotStarted',
  'payout.batch_exists': 'admin.payouts.errors.reasons.batchExists',
  [NOTHING_TO_PAY_REASON]: 'admin.payouts.errors.reasons.nothingToPay',
  'payout.concurrent_update': 'admin.payouts.errors.reasons.concurrentUpdate',
};

/** The ProblemDetails body of a failed call, or `null` when there is none (network failure, non-JSON body). */
function problemOf(error: unknown): Readonly<Record<string, unknown>> | null {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || error.details === null) {
    return null;
  }
  return error.details as Readonly<Record<string, unknown>>;
}

/** The `reason` extension of a failed call (`payout.batch_exists`, ...), if the server named one. */
export function payoutReasonOf(error: unknown): string | null {
  const reason = problemOf(error)?.['reason'];
  return typeof reason === 'string' ? reason : null;
}

/** The i18n key that explains a payout failure the client knows by its `reason`, or `null` when it does not know it. */
export function payoutReasonKey(error: unknown): string | null {
  const reason = payoutReasonOf(error);
  return reason !== null && Object.hasOwn(REASON_KEYS, reason) ? REASON_KEYS[reason] : null;
}

/**
 * The text the server gave for a failed call (ProblemDetails `detail`, else `title`) when there is one; otherwise `fallback`, the
 * caller's already-translated generic line. Never an empty string and never the interceptor's placeholder.
 */
export function serverMessageOr(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message.trim() !== '' && error.message !== NO_SERVER_MESSAGE ? error.message : fallback;
}

/** What a weekly round left out for standing, as the 409 `payout.nothing_to_pay` answer states it. */
export interface NothingToPayHeldBack {
  readonly tutorCount: number;
  readonly rowCount: number;
  readonly amount: number;
}

const finiteNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * The held-back figures of a `409 payout.nothing_to_pay`: `heldBackTutorCount`, `heldBackRowCount` and `heldBackAmount`, top-level members
 * of the ProblemDetails (`TutoringPayoutBatchService.BuildAsync`). `null` for any other failure, and for the plain "nothing is due"
 * answer, which carries none of them (it is only emitted when a tutor was held back).
 */
export function nothingToPayHeldBackOf(error: unknown): NothingToPayHeldBack | null {
  const problem = problemOf(error);
  if (!(error instanceof ApiError) || error.status !== 409 || problem === null || problem['reason'] !== NOTHING_TO_PAY_REASON) {
    return null;
  }
  const tutorCount = finiteNumber(problem['heldBackTutorCount']);
  if (tutorCount === null || tutorCount <= 0) {
    return null;
  }
  return {
    tutorCount,
    rowCount: finiteNumber(problem['heldBackRowCount']) ?? 0,
    amount: finiteNumber(problem['heldBackAmount']) ?? 0,
  };
}
