import { MonoTypeOperatorFunction, catchError, from, of, switchMap, throwError } from 'rxjs';

import { ApiError } from './error.interceptor';

/**
 * Backend "this deployment is missing a provider/setting" errors (`DomainErrorHttpResults`): any `DomainError` code
 * ending in `_not_configured` / `.not_configured` is answered as HTTP 503 with the code as ProblemDetails
 * `errorCode`. They are operator problems, not user mistakes, so the UI must say "temporarily unavailable" in plain
 * words instead of crashing or echoing the English server title.
 */
const NOT_CONFIGURED_KEYS: ReadonlyMap<string, string> = new Map([
  ['receipt.seller_not_configured', 'common.notConfigured.receiptSeller'],
  ['certificate.public_url_not_configured', 'common.notConfigured.certificatePublicUrl'],
  ['payout.payer_not_configured', 'common.notConfigured.payoutPayer'],
  ['attachment.virus_scanner_not_configured', 'common.notConfigured.attachmentScanner'],
  ['storage.provider_not_configured', 'common.notConfigured.storageProvider'],
  ['payment.provider_not_configured', 'common.notConfigured.paymentProvider'],
  ['video.provider_not_configured', 'common.notConfigured.videoProvider'],
]);

const GENERIC_NOT_CONFIGURED_KEY = 'common.notConfigured.generic';

/**
 * i18n key that explains a "not configured" 503 to the user, or `null` when the failure is anything else (so the
 * caller keeps its own generic handling). A code the map does not know yet but that follows the backend's
 * `*_not_configured` convention still gets the generic "temporarily unavailable" message.
 */
export function notConfiguredMessageKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 503 || !error.code) {
    return null;
  }
  const known = NOT_CONFIGURED_KEYS.get(error.code);
  if (known) {
    return known;
  }
  return error.code.endsWith('_not_configured') || error.code.endsWith('.not_configured')
    ? GENERIC_NOT_CONFIGURED_KEY
    : null;
}

interface ProblemBody {
  readonly title?: string;
  readonly detail?: string;
  readonly errorCode?: string;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function parseProblem(text: string): ProblemBody | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ProblemBody) : null;
  } catch {
    return null;
  }
}

/**
 * For requests made with `responseType: 'blob'` (PDF downloads): the error interceptor receives the ProblemDetails
 * body as an opaque `Blob`, so `ApiError.code` is lost. This re-reads that body and rethrows an `ApiError` carrying
 * the real `errorCode`, which is what lets {@link notConfiguredMessageKey} recognise a 503 on a download. Anything
 * that is not a JSON problem body is rethrown unchanged.
 */
export function restoreBlobProblem<T>(): MonoTypeOperatorFunction<T> {
  return catchError((error: unknown) => {
    if (!(error instanceof ApiError) || !isBlob(error.details)) {
      return throwError(() => error);
    }
    return from(readBlobText(error.details)).pipe(
      catchError(() => of('')),
      switchMap((text) => {
        const problem = parseProblem(text);
        return throwError(() =>
          problem
            ? new ApiError(error.status, problem.detail ?? problem.title ?? error.message, problem.errorCode, problem)
            : error,
        );
      }),
    );
  });
}
