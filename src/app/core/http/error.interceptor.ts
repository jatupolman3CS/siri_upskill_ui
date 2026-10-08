import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';

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
 *
 * For expired 401s on authenticated endpoints, transparently attempts token
 * refresh and retries the failed request once before failing.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);

  return next(req).pipe(
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

      // Attempt silent refresh on 401 for authenticated endpoints (excluding auth endpoints)
      if (
        error.status === 401 &&
        !req.url.includes('/identity/login') &&
        !req.url.includes('/identity/refresh') &&
        !req.url.includes('/identity/logout')
      ) {
        let authService: AuthService | null = null;
        try {
          authService = injector.get(AuthService);
        } catch {
          // If AuthService cannot be resolved (e.g. isolated unit testing), fall through
        }

        if (authService && authService.isAuthenticated()) {
          return authService.refreshToken().pipe(
            switchMap((newToken) => {
              if (!newToken) {
                return throwError(() => apiError);
              }
              const retriedReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
              return next(retriedReq).pipe(
                catchError((retryErr: unknown) => {
                  if (retryErr instanceof HttpErrorResponse) {
                    const retryBody: unknown = retryErr.error;
                    const retryProblem = isProblemDetailsLike(retryBody) ? retryBody : undefined;
                    return throwError(
                      () =>
                        new ApiError(
                          retryErr.status,
                          retryProblem?.detail ?? retryProblem?.title ?? 'common.error',
                          retryProblem?.errorCode,
                          retryProblem,
                        ),
                    );
                  }
                  return throwError(() => retryErr);
                }),
              );
            }),
          );
        }
      }

      return throwError(() => apiError);
    }),
  );
};
