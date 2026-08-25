import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Normalized error shape every `*ApiService` consumer can rely on, instead
 * of branching on raw `HttpErrorResponse` transport details.
 * <para>
 * A `class extends Error`, not a plain object shape — discovered directly from a real 404 in the
 * browser while building `CourseDetailPage` (P1-22), not a guess: Angular's `resource()`/`rxResource()`
 * requires a thrown stream error to be an actual `Error` instance, or it silently wraps it in a
 * synthetic `ResourceWrappedError` whose own `.status`/`.code`/`.message` are all gone (the real value
 * only survives on `.cause`, which nothing in this codebase reads) — so a 404 and a 500 became
 * indistinguishable through a resource's `.error()` the moment `ApiError` was a plain object literal.
 * Every existing consumer that destructures `.status`/`.message`/`.code`/`.details` off a caught
 * `ApiError` (`DevicesPage`, the auth pages, `fieldError`) keeps working unchanged — those are still
 * just public fields on the thrown value, now inherited from `Error` instead of object-literal
 * shorthand.
 * </para>
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ProblemDetailsLike {
  readonly title?: string;
  readonly detail?: string;
  /**
   * Matches `DomainErrorHttpResults.ToProblemHttpResult`'s actual extension key
   * (`Siri.Modules.Identity/Infrastructure/Endpoints/DomainErrorHttpResults.cs`):
   * `extensions["errorCode"]`, not `"code"`. Getting this key wrong means
   * `ApiError.code` silently stays `undefined` for every real backend error — verified
   * by reading that file directly rather than assumed (CLAUDE.md rule 2).
   */
  readonly errorCode?: string;
}

function isProblemDetailsLike(value: unknown): value is ProblemDetailsLike {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalizes every failed HTTP call into an `ApiError`. The backend returns
 * RFC 9457 ProblemDetails bodies (see ARCHITECTURE.md section 2, cross-cutting
 * error handling) once real endpoints exist; this already understands that
 * shape plus falls back gracefully for network-level failures that never
 * reach the server. `message` falls back to an i18n key (not display text)
 * so callers can resolve it through `TranslationService` themselves.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      const body: unknown = error.error;
      const problemDetails = isProblemDetailsLike(body) ? body : undefined;

      const apiError = new ApiError(
        error.status,
        problemDetails?.detail ?? problemDetails?.title ?? 'common.error',
        problemDetails?.errorCode,
        problemDetails,
      );

      return throwError(() => apiError);
    }),
  );
