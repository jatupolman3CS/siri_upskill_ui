import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { EnvironmentInjector, InjectionToken, createEnvironmentInjector, inject } from '@angular/core';

import { apiBaseUrlInterceptor } from './api-base-url.interceptor';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';

/**
 * An `HttpClient` backed by XHR instead of the app-wide `fetch` backend, for requests that must show upload progress.
 *
 * Why this exists: `app.config.ts` uses `withFetch()`, and the Fetch API cannot report how many bytes of a request body
 * have left the browser. Angular's `FetchBackend` therefore never emits `HttpEventType.UploadProgress` (it even throws
 * if `reportUploadProgress` is requested), so a `reportProgress: true` POST through the normal client would leave a
 * progress bar stuck at 0% until the whole upload finished. A child injector with `withXhr()` gives the one feature that
 * needs it a real upload-progress stream, while every other request keeps going through `fetch` exactly as before.
 *
 * The child client reuses the same three interceptors as the app (API base URL, bearer token, error normalisation + the
 * 401 refresh-and-retry), so callers get `ApiError`s and authenticated requests just like with the root `HttpClient`.
 *
 * Browser only: nothing resolves this token during SSR, because uploads are started from user gestures. Specs replace it
 * with `{ provide: UPLOAD_HTTP_CLIENT, useExisting: HttpClient }` so `HttpTestingController` sees the requests.
 */
export const UPLOAD_HTTP_CLIENT = new InjectionToken<HttpClient>('UPLOAD_HTTP_CLIENT', {
  providedIn: 'root',
  factory: () =>
    createEnvironmentInjector(
      [provideHttpClient(withXhr(), withInterceptors([apiBaseUrlInterceptor, authInterceptor, errorInterceptor]))],
      inject(EnvironmentInjector),
    ).get(HttpClient),
});
